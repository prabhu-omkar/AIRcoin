"""Plant feature vectors for enrolment and plant matching.

Backends:
  mobilenet  pretrained torchvision MobileNetV3-Small, 576-d (no training). Needs torch + torchvision
             and downloads the ImageNet weights once.
  colorhist  HSV colour histogram + gradient-orientation histogram, no extra dependencies.
             Weaker, but works offline and on any Pi.

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
    return ColorHistEmbedder()


def similarity(a, b):
    return float(np.dot(a, b))
