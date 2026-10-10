"""PoUW estimation model (PRD 2.5).

    R_i,p = k_s(i),p * A_i * H_i * f(C_p / C_p,ref) * dt     f(x) = min(x, concentration_factor_cap)
    AIR   = sum_p w_p * sum_i R_i,p

k in mg / m2 leaf / h, A = leaf area in m2, H = alive_score (0..1), dt in hours.
Only plants whose status is "present" earn; missing, removed and suspect plants earn 0.
"""

from __future__ import annotations

from .catalogue import POLLUTANTS, SENSOR_KEY, Catalogue


def removal_rates_mg_per_h(cat: Catalogue, species: str, leaf_area_cm2: float, health: float,
                           sensors: dict) -> dict[str, float]:
    k = cat.k.get(species)
    if k is None:
        return {}
    area_m2 = leaf_area_cm2 / 10_000
    rates = {}
    for p in POLLUTANTS:
        conc = sensors.get(SENSOR_KEY[p])
        if conc is None:  # optional sensor not fitted
            continue
        factor = min(conc / cat.ref_concentration[p], cat.factor_cap)
        rates[p] = k[p] * area_m2 * health * factor
    return rates


def air_of(cat: Catalogue, removed_mg: dict[str, float]) -> float:
    return sum(cat.weights[p] * mg for p, mg in removed_mg.items())
