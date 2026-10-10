# Plant-removal calibration protocol

This protocol replaces literature-seeded coefficients with measured values for each species.

Use a sealed, mixed enclosure of known volume with a calibrated reference instrument for PM2.5,
PM10, NO2, SO2, CO, CO2 and VOC. Record temperature, humidity and pressure. Measure leaf area,
photograph the plant and assign its sticker before every run.

For each pollutant and species, perform at least three empty-enclosure control runs and three plant
runs at low, medium and high starting concentrations. After a stable baseline, introduce a safe,
measured pollutant dose, mix the air, stop the source and record concentration every second until
the concentration reaches background. Never expose people; gases require trained laboratory staff,
appropriate ventilation and calibrated sources.

Fit the decay model to the well-mixed interval. Subtract the empty-box loss rate from the plant-run
loss rate, normalize by measured leaf area and report the coefficient with its confidence interval.
Reject runs with leaks, sensor saturation, condensation or poor mixing. Blindly repeat 10% of runs.

Store raw CSV files, instrument calibration certificates, enclosure volume, environmental conditions,
plant health, fitted coefficients and analysis version. A second reviewer signs the result. Promote a
new table only through the frozen `contracts-schema` change process, bump its version, regenerate its
canonical hash and deploy the same hash to miner and validator. Literature values remain clearly
labelled as demo estimates until this protocol is completed in a real enclosure.
