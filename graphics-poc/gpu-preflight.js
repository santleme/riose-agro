export function classifyWebGlAdapterInfo({available, vendor = '', renderer = '', unmasked = false}) {
  const identity = `${vendor} ${renderer}`;
  const softwareFallback = /swiftshader|llvmpipe|software|w rast|microsoft basic render/i.test(identity);
  return {
    available: Boolean(available),
    api: 'WebGL',
    vendor,
    renderer,
    unmasked: Boolean(unmasked),
    softwareFallback,
    identifiesGtx1060: Boolean(available) && !softwareFallback && /nvidia/i.test(identity) && /gtx\s*1060/i.test(renderer),
  };
}
