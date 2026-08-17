declare module "heic-decode" {
  export type HeicDecodedImage = Readonly<{
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }>;

  export type HeicImageHandle = Readonly<{
    width: number;
    height: number;
    decode(): Promise<HeicDecodedImage>;
  }>;

  export type HeicImageHandles = HeicImageHandle[] & {
    dispose(): void;
  };

  export type HeicDecode = {
    (input: Readonly<{ buffer: Uint8Array }>): Promise<HeicDecodedImage>;
    all(input: Readonly<{ buffer: Uint8Array }>): Promise<HeicImageHandles>;
  };

  const decode: HeicDecode;
  export default decode;
}
