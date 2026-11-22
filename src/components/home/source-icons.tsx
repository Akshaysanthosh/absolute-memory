/** Small source marks for the public landing page. Decorative: always paired with a text label. */
type IconProps = { size?: number };

export function YouTubeIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="4" width="22" height="16" rx="5" fill="#FF0000" />
      <path d="M10 8.5v7l6-3.5z" fill="#fff" />
    </svg>
  );
}

export function XIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#000" stroke="#fff" strokeOpacity=".35" />
      <path
        d="M6.4 6h3.4l2.9 4 3.4-4h1.5l-4.2 4.9L18 18h-3.4l-3.1-4.4L7.7 18H6.2l4.6-5.3z"
        fill="#fff"
      />
    </svg>
  );
}

export function InstagramIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="6.5" fill="#E1306C" />
      <rect
        x="6.2"
        y="6.2"
        width="11.6"
        height="11.6"
        rx="5.8"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
      />
      <circle cx="17.6" cy="6.4" r="1.3" fill="#fff" />
    </svg>
  );
}

export function RedditIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11.5" fill="#FF4500" />
      <ellipse cx="12" cy="14.2" rx="6.6" ry="4.6" fill="#fff" />
      <circle cx="9.5" cy="13.6" r="1.1" fill="#FF4500" />
      <circle cx="14.5" cy="13.6" r="1.1" fill="#FF4500" />
      <circle cx="17.2" cy="5.6" r="1.6" fill="#fff" />
      <path d="M12 9.6l1.1-4.2 4.1.6" stroke="#fff" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

export function PodcastIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#8C3FF0" />
      <circle cx="12" cy="10" r="2.6" fill="#fff" />
      <path d="M10.7 13.5h2.6l-.5 6h-1.6z" fill="#fff" />
      <path
        d="M7.6 14.2a6 6 0 1 1 8.8 0"
        stroke="#fff"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PdfIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 2h10l5 5v15H5z" fill="#fff" stroke="#14161A" strokeWidth="1.6" />
      <path d="M15 2v5h5" fill="none" stroke="#14161A" strokeWidth="1.6" />
      <rect x="2.5" y="11.5" width="15" height="7.5" rx="2" fill="#E5252A" />
      <text
        x="10"
        y="17.2"
        fontSize="5.6"
        fontWeight="800"
        fill="#fff"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
      >
        PDF
      </text>
    </svg>
  );
}

export function ScreenshotIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="2"
        y="4"
        width="20"
        height="16"
        rx="3"
        fill="#FFD23F"
        stroke="#14161A"
        strokeWidth="1.6"
      />
      <circle cx="8" cy="9.5" r="1.8" fill="#14161A" />
      <path
        d="M3 18l6-5 4 3 3-2 5 4"
        fill="none"
        stroke="#14161A"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function WebIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#7FB2FF" stroke="#14161A" strokeWidth="1.6" />
      <path
        d="M2 12h20M12 2c3.2 3 3.2 17 0 20M12 2c-3.2 3-3.2 17 0 20"
        stroke="#14161A"
        strokeWidth="1.4"
        fill="none"
      />
    </svg>
  );
}

export function NoteIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="4"
        y="2"
        width="16"
        height="20"
        rx="3"
        fill="#3DD598"
        stroke="#14161A"
        strokeWidth="1.6"
      />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="#14161A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function ChromeIcon({ size = 24 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="#DB4437" />
      <path d="M21.1 6.75A10.5 10.5 0 0 1 12 22.5l4.6-8z" fill="#FFCD40" />
      <path d="M12 22.5A10.5 10.5 0 0 1 2.9 6.75l4.6 8z" fill="#0F9D58" />
      <circle cx="12" cy="12" r="4.6" fill="#fff" />
      <circle cx="12" cy="12" r="3.6" fill="#4285F4" />
    </svg>
  );
}

/** The Absolute Memory mark: two bars holding one coral point, like |x|, the absolute value. */
export function AbsoluteMark({ size = 28, ink = '#14161A' }: IconProps & { ink?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="11" y="10" width="10" height="44" rx="5" fill={ink} />
      <rect x="43" y="10" width="10" height="44" rx="5" fill={ink} />
      <circle cx="32" cy="32" r="8.5" fill="#FF6A4D" />
    </svg>
  );
}

export function BrandMark({
  size = 30,
  accent = '#FF6A4D',
  dot = '#FFFDF7',
}: IconProps & { accent?: string; dot?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 210 190" aria-hidden="true">
      <path
        fill={accent}
        d="M32 53H76c12 0 17 6 21 20 5 19 13 38 25 40 11 1 25-17 41-30 14-12 27-17 36-13 7 3 8 9 6 19-11 62-40 96-97 96C49 185 18 158 11 108 6 73 10 53 32 53Z"
      />
      <circle fill={dot} cx="141" cy="27" r="25" />
    </svg>
  );
}
