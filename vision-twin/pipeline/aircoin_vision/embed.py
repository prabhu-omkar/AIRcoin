"""Plant feature vectors for enrolment and plant matching.

Backends:
  mobilenet  pretrained torchvision MobileNetV3-Small, 576-d (no training). Needs torch + torchvision
             and downloads the ImageNet weights once.
  leafhist   plant pixels only: hue/sat/value histograms, gradient orientations, leaf-blob sizes. No extra
             dependencies; the default when torch is not installed.
  colorhist  whole-crop HSV + gradient histogram (Phase 1; kept so old enrolments still load).

All vectors are L2-normalised, so similarity is a dot product in [-1, 1].
"""

import cv2
import numpy as np


class ColorHistEmbedder:
    name = "colorhist"

    def __call__(self, crop_bgr):
        img = cv2.resize(crop_bgr, (128, 128), interpolation=cv2.INTER_AREA)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        hist = cv2.calcHist([hsv], [0, 1, 2], None, [12, 6, 4], [0, 180, 0, 256, 0, 256]).flatten()
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gx, gy = cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)
        mag, ang = cv2.cartToPolar(gx, gy)
        grad, _ = np.histogram(ang % np.pi, bins=12, range=(0, np.pi), weights=mag)
        vec = np.concatenate([hist / (hist.sum() + 1e-6), grad / (grad.sum() + 1e-6)]).astype(np.float32)
        return vec / (np.linalg.norm(vec) + 1e-9)


class LeafHistEmbedder:
    """Plant pixels only (the wall behind is the same for every pot and would make all plants look alike):
    hue / saturation / value histograms, gradient orientations and leaf-blob sizes. No extra dependencies."""

    name = "leafhist"

    def __call__(self, crop_bgr):
        img = cv2.resize(crop_bgr, (160, 160), interpolation=cv2.INTER_AREA)
        c = img.astype(np.int16)
        mask = ((c.max(axis=2) - c.min(axis=2)) > 30).astype(np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        if mask.sum() < 40:  # nothing plant-like: a distinct "empty" vector
            vec = np.zeros(36 + 16 + 16 + 18 + 8, np.float32)
            vec[-1] = 1.0
            return vec
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        # exposure invariance: scale brightness so the plant's median sits mid-range
        v = hsv[..., 2].astype(np.float32)
        med = float(np.median(v[mask > 0])) or 1.0
        hsv[..., 2] = np.clip(v * (128.0 / med), 0, 255).astype(np.uint8)
        parts = []
        for ch, bins, hi, weight in ((0, 36, 180, 1.4), (1, 16, 256, 0.8), (2, 16, 256, 0.8)):
            h = cv2.calcHist([hsv], [ch], mask, [bins], [0, hi]).flatten()
            h = cv2.GaussianBlur(h.reshape(1, -1), (1, 3), 0).flatten()  # tolerate small colour shifts
            parts.append(weight * h / (np.linalg.norm(h) + 1e-6))
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gx, gy = cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1)
        mag, ang = cv2.cartToPolar(gx, gy)
        edge = cv2.dilate(mask, np.ones((3, 3), np.uint8)) > 0
        grad, _ = np.histogram((ang % np.pi)[edge], bins=18, range=(0, np.pi), weights=mag[edge])
        parts.append(1.2 * grad / (np.linalg.norm(grad) + 1e-6))
        # leaf blob sizes (log-spaced): small-leaved vs broad-leaved plants
        n, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
        areas = stats[1:, cv2.CC_STAT_AREA] if n > 1 else np.array([1])
        blob, _ = np.histogram(np.log2(np.maximum(areas, 1)), bins=8, range=(2, 14), weights=areas)
        parts.append(0.8 * blob / (np.linalg.norm(blob) + 1e-6))
        vec = np.concatenate(parts).astype(np.float32)
        return vec / (np.linalg.norm(vec) + 1e-9)


class MobileNetEmbedder:
    name = "mobilenet"

    def __init__(self):
        import torch
        from torchvision import models

        weights = models.MobileNet_V3_Small_Weights.DEFAULT
        model = models.mobilenet_v3_small(weights=weights)
        model.classifier = torch.nn.Identity()
        self.model = model.eval()
        self.torch = torch
        self.mean = np.array([0.485, 0.456, 0.406], np.float32)
        self.std = np.array([0.229, 0.224, 0.225], np.float32)

    def __call__(self, crop_bgr):
        rgb = cv2.cvtColor(cv2.resize(crop_bgr, (224, 224), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
        x = ((rgb.astype(np.float32) / 255 - self.mean) / self.std).transpose(2, 0, 1)[None]
        with self.torch.no_grad():
            vec = self.model(self.torch.from_numpy(x)).numpy()[0].astype(np.float32)
        return vec / (np.linalg.norm(vec) + 1e-9)


def make_embedder(name="auto"):
    if name in ("auto", "mobilenet"):
        try:
            return MobileNetEmbedder()
        except ImportError:
            if name == "mobilenet":
                raise
    if name == "colorhist":
        return ColorHistEmbedder()
    return LeafHistEmbedder()


def similarity(a, b):
    return float(np.dot(a, b))
