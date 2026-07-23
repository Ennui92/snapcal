// Hand-drawn line icons. Emoji are the tell of a generated app: they carry
// another vendor's art direction and they break the moment the UI goes dark.
// These are 24x24 stroked paths that inherit colour and weight.
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from '@/constants/theme';

export type IconName =
  | 'camera' | 'gallery' | 'bolt' | 'boltOff' | 'settings' | 'chart' | 'close'
  | 'back' | 'plus' | 'check' | 'flame' | 'cutlery' | 'drop' | 'clock'
  | 'trash' | 'refresh' | 'share' | 'scale' | 'hand' | 'bell' | 'globe'
  | 'link' | 'warn' | 'chevron' | 'sparkle';

type Props = { name: IconName; size?: number; color?: string; weight?: number };

export function Icon({ name, size = 22, color = C.ink, weight = 1.8 }: Props) {
  const common = {
    stroke: color,
    strokeWidth: weight,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {render(name, common, color)}
    </Svg>
  );
}

function render(name: IconName, p: object, color: string) {
  switch (name) {
    case 'camera':
      return (
        <>
          <Path d="M3 8.5h3.2l1.6-2.3h8.4l1.6 2.3H21v10H3z" {...p} />
          <Circle cx="12" cy="13.2" r="3.6" {...p} />
        </>
      );
    case 'gallery':
      return (
        <>
          <Rect x="3" y="4.5" width="18" height="15" rx="1.5" {...p} />
          <Path d="M3 15.5l4.5-4 4 3.5 3.5-3.5L21 16" {...p} />
          <Circle cx="8.4" cy="9" r="1.4" {...p} />
        </>
      );
    case 'bolt':
      return <Path d="M13.5 2.5L5 13.2h5.4l-.9 8.3L18 10.8h-5.4z" {...p} />;
    case 'boltOff':
      return (
        <>
          <Path d="M13.5 2.5L5 13.2h5.4l-.9 8.3L18 10.8h-5.4z" {...p} opacity={0.45} />
          <Path d="M3.5 3.5l17 17" {...p} />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle cx="12" cy="12" r="3.1" {...p} />
          <Path d="M12 2.6v2.6M12 18.8v2.6M21.4 12h-2.6M5.2 12H2.6M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8M18.6 18.6l-1.8-1.8M7.2 7.2L5.4 5.4" {...p} />
        </>
      );
    case 'chart':
      return <Path d="M3.5 20.5h17M7 20.5v-6.2M12 20.5V6.5M17 20.5v-9.4" {...p} />;
    case 'close':
      return <Path d="M5.5 5.5l13 13M18.5 5.5l-13 13" {...p} />;
    case 'back':
      return <Path d="M14.5 4.5L7 12l7.5 7.5" {...p} />;
    case 'chevron':
      return <Path d="M9 5.5L16 12l-7 6.5" {...p} />;
    case 'plus':
      return <Path d="M12 4.8v14.4M4.8 12h14.4" {...p} />;
    case 'check':
      return <Path d="M4.5 12.5l5 5 10-10.5" {...p} />;
    case 'flame':
      return (
        <Path
          d="M12 21.2c3.6 0 6-2.4 6-5.6 0-4.4-4.2-5.7-3.2-11.4-2.5.9-4 3-4 5.2 0 1.3-.8 1.9-1.5 1.3-.6-.5-.8-1.4-.8-2.2C6.9 10 6 12 6 15.6c0 3.2 2.4 5.6 6 5.6z"
          {...p}
        />
      );
    case 'cutlery':
      return (
        <>
          <Path d="M7 2.8v7.4M4.6 2.8v4.2c0 1.3 1 2.4 2.4 2.4s2.4-1.1 2.4-2.4V2.8M7 10.2v11" {...p} />
          <Path d="M16.6 2.8c-1.5 1-2.3 3-2.3 5.2 0 1.7.7 2.8 2.3 3.1v10.1" {...p} />
        </>
      );
    case 'drop':
      return <Path d="M12 3.2s5.4 5.6 5.4 9.4A5.4 5.4 0 0112 18a5.4 5.4 0 01-5.4-5.4C6.6 8.8 12 3.2 12 3.2z" {...p} />;
    case 'clock':
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" {...p} />
          <Path d="M12 6.8V12l3.4 2.2" {...p} />
        </>
      );
    case 'trash':
      return (
        <>
          <Path d="M4.2 6.4h15.6M9.4 6.4V4.2h5.2v2.2M6.4 6.4l1 13.4h9.2l1-13.4" {...p} />
        </>
      );
    case 'refresh':
      return (
        <>
          <Path d="M20 12a8 8 0 11-2.6-5.9" {...p} />
          <Path d="M20.4 3.6v4.6h-4.6" {...p} />
        </>
      );
    case 'share':
      return (
        <>
          <Path d="M12 15.4V3.6M8 7.4L12 3.4l4 4" {...p} />
          <Path d="M5.2 13.6v5.4c0 .9.7 1.6 1.6 1.6h10.4c.9 0 1.6-.7 1.6-1.6v-5.4" {...p} />
        </>
      );
    case 'scale':
      return (
        <>
          <Rect x="3.2" y="4.4" width="17.6" height="15.2" rx="2" {...p} />
          <Path d="M12 8.4v3.2M8.6 9.6a4 4 0 016.8 0" {...p} />
        </>
      );
    case 'hand':
      return (
        <Path
          d="M8.4 11V5.4a1.4 1.4 0 012.8 0V10m0-.6V4a1.4 1.4 0 012.8 0v5.6m0-.4V5.8a1.4 1.4 0 012.8 0v7.4c0 4.2-2.4 7-6 7-2.6 0-4.2-1.2-5.4-3.6l-2-4c-.5-1 .3-2.2 1.4-2 .5.1.9.4 1.1.9l1.5 2.9"
          {...p}
        />
      );
    case 'bell':
      return (
        <>
          <Path d="M18 16.4H6l1.4-2.2V10a4.6 4.6 0 019.2 0v4.2z" {...p} />
          <Path d="M10.2 19.2a2 2 0 003.6 0" {...p} />
        </>
      );
    case 'globe':
      return (
        <>
          <Circle cx="12" cy="12" r="8.6" {...p} />
          <Path d="M3.6 12h16.8M12 3.4c2.2 2.4 3.3 5.3 3.3 8.6S14.2 18.2 12 20.6c-2.2-2.4-3.3-5.3-3.3-8.6S9.8 5.8 12 3.4z" {...p} />
        </>
      );
    case 'link':
      return (
        <>
          <Path d="M10.4 13.6a3.6 3.6 0 015.1 0l.4.4M13.6 10.4a3.6 3.6 0 00-5.1 0l-.4.4" {...p} />
          <Path d="M14.8 15.2l-2.2 2.2a3.8 3.8 0 01-5.4-5.4l2.2-2.2M9.2 8.8l2.2-2.2a3.8 3.8 0 015.4 5.4l-2.2 2.2" {...p} />
        </>
      );
    case 'warn':
      return (
        <>
          <Path d="M12 4.2l9 15.6H3z" {...p} />
          <Path d="M12 10v3.8" {...p} />
          <Circle cx="12" cy="16.8" r="0.9" fill={color} stroke="none" />
        </>
      );
    case 'sparkle':
      return (
        <Path d="M12 3.2l1.9 5.3 5.3 1.9-5.3 1.9L12 17.6l-1.9-5.3-5.3-1.9 5.3-1.9zM18.6 15.4l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" {...p} />
      );
    default:
      return null;
  }
}
