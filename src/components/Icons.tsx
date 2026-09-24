import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function make(paths: React.ReactNode, opts: { fill?: boolean } = {}) {
  return function Icon({ size = 20, ...rest }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={opts.fill ? 'currentColor' : 'none'}
        stroke={opts.fill ? 'none' : 'currentColor'}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {paths}
      </svg>
    )
  }
}

export const PlayIcon = make(<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5Z" />, { fill: true })
export const PauseIcon = make(<><rect x="6" y="4" width="4" height="16" rx="1.2" /><rect x="14" y="4" width="4" height="16" rx="1.2" /></>, { fill: true })
export const NextIcon = make(<><path d="M5 5.2v13.6a1 1 0 0 0 1.5.86l10-6.8a1 1 0 0 0 0-1.72l-10-6.8A1 1 0 0 0 5 5.2Z" /><rect x="17" y="4" width="2.5" height="16" rx="1" /></>, { fill: true })
export const PrevIcon = make(<><path d="M19 5.2v13.6a1 1 0 0 1-1.5.86l-10-6.8a1 1 0 0 1 0-1.72l10-6.8A1 1 0 0 1 19 5.2Z" /><rect x="4.5" y="4" width="2.5" height="16" rx="1" /></>, { fill: true })
export const Back10Icon = make(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><text x="12" y="15.5" fontSize="7.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">10</text></>)
export const Fwd10Icon = make(<><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /><text x="12" y="15.5" fontSize="7.5" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">10</text></>)
export const ShuffleIcon = make(<><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" /></>)
export const RepeatIcon = make(<><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>)
export const VolumeIcon = make(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" /></>)
export const VolumeLowIcon = make(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /></>)
export const MuteIcon = make(<><path d="M11 5 6 9H2v6h4l5 4V5Z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" /></>)
export const HeartIcon = make(<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />)
export const HeartFillIcon = make(<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />, { fill: true })
export const HomeIcon = make(<><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" /></>)
export const SearchIcon = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>)
export const RadioIcon = make(<><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4" /><path d="M19 5a10 10 0 0 1 0 14" /><path d="M5 19A10 10 0 0 1 5 5" /></>)
export const LibraryIcon = make(<><path d="M4 4v16" /><path d="M9 4v16" /><path d="m14 4 5 16" /></>)
export const QueueIcon = make(<><path d="M3 6h13" /><path d="M3 12h13" /><path d="M3 18h9" /><path d="M18 14v7" /><path d="m21 17.5-3 3.5" /><circle cx="18" cy="21" r="0" /></>)
export const PlusIcon = make(<><path d="M12 5v14" /><path d="M5 12h14" /></>)
export const MoreIcon = make(<><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></>, { fill: true })
export const CloseIcon = make(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>)
export const TrashIcon = make(<><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>)
export const GripIcon = make(<><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></>, { fill: true })
export const MusicIcon = make(<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>)
export const DiscIcon = make(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /></>)
export const ShareIcon = make(<><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" /><path d="m16 6-4-4-4 4" /><path d="M12 2v13" /></>)
export const DownloadIcon = make(<><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>)
export const UploadIcon = make(<><path d="M12 21V9" /><path d="m7 14 5-5 5 5" /><path d="M5 3h14" /></>)
export const EditIcon = make(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>)
export const MoonIcon = make(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />)
export const KeyboardIcon = make(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M9 15h6" /></>)
export const MinimizeIcon = make(<><path d="M4 14h6v6" /><path d="M20 10h-6V4" /><path d="m14 10 7-7" /><path d="m3 21 7-7" /></>)
export const MaximizeIcon = make(<><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="m21 3-7 7" /><path d="m3 21 7-7" /></>)
export const FocusIcon = make(<><circle cx="12" cy="12" r="3" /><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /></>)
export const ExternalIcon = make(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>)
export const ChevronRightIcon = make(<path d="m9 18 6-6-6-6" />)
export const ChevronLeftIcon = make(<path d="m15 18-6-6 6-6" />)
export const ArrowUpIcon = make(<><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></>)
export const ArrowDownIcon = make(<><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>)
export const WaveIcon = make(<><path d="M2 12h2" /><path d="M6 8v8" /><path d="M10 5v14" /><path d="M14 9v6" /><path d="M18 7v10" /><path d="M22 12h-2" /></>)
export const CheckIcon = make(<path d="M20 6 9 17l-5-5" />)
export const ListPlusIcon = make(<><path d="M3 6h12" /><path d="M3 12h12" /><path d="M3 18h8" /><path d="M18 13v8" /><path d="M14 17h8" /></>)
