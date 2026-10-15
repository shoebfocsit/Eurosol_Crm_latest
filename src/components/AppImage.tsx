import { type ImgHTMLAttributes, useEffect, useState } from 'react';
import { cn, resolveImageUrl } from '@/lib/utils';

interface AppImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'referrerPolicy'> {
  src?: string | null;
  alt?: string;
  referrerPolicy?: ImgHTMLAttributes<HTMLImageElement>['referrerPolicy'];
}

export function AppImage({ src, alt = '', className, onError, referrerPolicy, ...rest }: AppImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <div className={cn('bg-stone-100', className)} aria-hidden="true" />;
  }

  return (
    <img
      src={resolveImageUrl(src)}
      alt={alt}
      className={className}
      referrerPolicy={referrerPolicy}
      onError={(e) => {
        setFailed(true);
        onError?.(e);
      }}
      {...rest}
    />
  );
}