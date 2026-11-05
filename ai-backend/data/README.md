# Data policy

No real dataset is included or loaded. `examples/` contains synthetic requests only; `data/raw/` is ignored.

Before ingestion, document purpose, consent/legal basis, custodian, allowed features, units, time range, retention, access/deletion and representative coverage. Keep raw data outside Git. Never use names, phones, health readings, sensor streams or wearable participation as production-model features.

Future dataset manifests may contain versions, approved schema/cohort descriptions and content digests, not sensitive samples. Historical completion labels must be genuine and support time-aware splits. Dataset ingestion is not implemented yet.
