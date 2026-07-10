import type { ImgHTMLAttributes } from 'react';

const VARIANT_PATTERN = /-1280\.webp(?:\?.*)?$/i;

export const responsiveImageProps = (
  url: string,
  sizes = '(max-width: 640px) 100vw, 640px',
): Pick<ImgHTMLAttributes<HTMLImageElement>, 'srcSet' | 'sizes' | 'loading' | 'decoding'> => {
  const shared = { loading: 'lazy' as const, decoding: 'async' as const };
  if (!VARIANT_PATTERN.test(url)) return shared;
  const cleanUrl = url.replace(/\?.*$/, '');
  const stem = cleanUrl.replace(/-1280\.webp$/i, '');
  return {
    ...shared,
    srcSet: `${stem}-320.webp 320w, ${stem}-640.webp 640w, ${stem}-1280.webp 1280w`,
    sizes,
  };
};
