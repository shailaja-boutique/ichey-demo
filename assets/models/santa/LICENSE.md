# Father Christmas 3D model (LOD1)

- **Primary file:** `santa-lod0.glb` (LOD0, highest detail in this integration)
- **Fallback:** `santa-lod1.glb`
- **Source:** [tevy.dev/models/santa](https://tevy.dev/models/santa) (pinned v1)
- **License:** [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)
- **Animations:** `idle`, `walk`, `look_around`, `wave`
- **Attribution:** Not required (CC0). Credit to tevy is optional.

Download reference: `https://tevy.dev/models/santa/v1/lod1.glb`

## Runtime decoders (Three.js r170 examples, MIT)

- `assets/vendor/loaders/GLTFLoader.js`
- `assets/vendor/loaders/KTX2Loader.js`
- `assets/vendor/libs/basis/basis_transcoder.*`
- `assets/vendor/libs/meshopt_decoder.module.js`
- Supporting utils: `BufferGeometryUtils.js`, `WorkerPool.js`, `zstddec.module.js`, `ktx-parse.module.js`, `ColorSpaces.js`