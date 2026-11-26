'use client';

import React, { useState } from 'react';
import type { InstansiConfig } from '@/lib/types';
import { InstansiLogo } from './InstansiLogo';

interface KopSuratProps {
  instansi: InstansiConfig | null;
  subLabel?: string;
}

export function KopSurat({ instansi, subLabel }: KopSuratProps) {
  const [kopBroken, setKopBroken] = useState(false);

  if (instansi?.kopSuratUrl && !kopBroken) {
    return (
      <div className="w-full mb-4 border-b-2 border-black pb-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={instansi.kopSuratUrl}
          alt="Kop Surat Instansi"
          referrerPolicy="no-referrer"
          onError={() => setKopBroken(true)}
          className="w-full max-h-36 object-contain mx-auto"
        />
      </div>
    );
  }

  return (
    <div className="w-full mb-5">
      <div className="flex items-center gap-4 pb-3 border-b-[3px] border-black">
        <div className="shrink-0 pl-1">
          <InstansiLogo
            logoUrl={instansi?.logoUrl}
            alt={instansi?.namaInstansi || 'Logo Instansi'}
            size={68}
          />
        </div>
        <div className="flex-1 text-center leading-tight">
          <p className="text-[15px] font-bold tracking-wide text-black uppercase">
            {instansi?.namaInstansi || 'PEMERINTAH KABUPATEN DEMAK'}
          </p>
          <p className="text-[19px] font-bold tracking-wide text-black uppercase mt-0.5">
            {instansi?.subInstansi || 'SEKRETARIAT DAERAH'}
          </p>
          {subLabel && (
            <p className="text-[12px] font-semibold text-black uppercase mt-0.5">{subLabel}</p>
          )}
          <p className="text-[11px] text-black mt-1">
            {instansi?.alamat || 'Jl. Kyai Singkil No. 7 Demak, Jawa Tengah 59511'}
          </p>
          <p className="text-[10.5px] text-black">
            {[
              instansi?.telepon ? `Telp. ${instansi.telepon}` : '',
              instansi?.fax ? `Fax. ${instansi.fax}` : '',
              instansi?.website ? `Website: ${instansi.website}` : '',
              instansi?.email ? `Email: ${instansi.email}` : '',
            ]
              .filter(Boolean)
              .join('  |  ')}
          </p>
        </div>
        <div className="w-[68px] shrink-0 hidden sm:block" />
      </div>
      <div className="border-b border-black mt-[2px]" />
    </div>
  );
}
