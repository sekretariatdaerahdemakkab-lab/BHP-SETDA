'use client';

import React, { useState } from 'react';

interface InstansiLogoProps {
  logoUrl?: string;
  alt?: string;
  size?: number;
  className?: string;
}

export function InstansiLogo({
  logoUrl,
  alt = 'Logo Instansi',
  size = 40,
  className = '',
}: InstansiLogoProps) {
  const [broken, setBroken] = useState(false);

  if (logoUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={{ width: size, height: size }}
        className={`object-contain shrink-0 ${className}`}
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label={alt}
      className={`shrink-0 ${className}`}
    >
      <path
        d="M32 4L56 12V30C56 44.5 45.6 56.2 32 60C18.4 56.2 8 44.5 8 30V12L32 4Z"
        fill="#0F766E"
        stroke="#0F172A"
        strokeWidth="2.5"
      />
      <path
        d="M32 10L50 16V30C50 41.2 42 50.4 32 53.8C22 50.4 14 41.2 14 30V16L32 10Z"
        fill="#F8FAFC"
      />
      <path d="M32 16L35.2 22.8L42.5 23.6L37 28.6L38.6 35.8L32 32.1L25.4 35.8L27 28.6L21.5 23.6L28.8 22.8L32 16Z" fill="#D97706" />
      <path d="M21 41H43V44.5H21V41Z" fill="#0F766E" />
      <path d="M24 46H40V48.5H24V46Z" fill="#0F172A" />
    </svg>
  );
}
