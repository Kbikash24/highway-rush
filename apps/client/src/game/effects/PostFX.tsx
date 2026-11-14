import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';

export function PostFX() {
  return (
    <EffectComposer multisampling={4}>
      <Bloom mipmapBlur intensity={0.55} luminanceThreshold={0.9} luminanceSmoothing={0.2} />
      <Vignette offset={0.25} darkness={0.55} />
    </EffectComposer>
  );
}
