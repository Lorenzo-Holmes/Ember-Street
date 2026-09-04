export type ResourceIconKind = 'ration' | 'medicine' | 'materials' | 'parts' | 'hope';

export default function ResourceIcon({ kind }: { kind: ResourceIconKind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.55, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className={`v1-resource-icon v1-resource-icon--${kind}`} viewBox="0 0 40 32" aria-hidden="true">
      {kind === 'ration' ? <g {...common}><path d="M5.5 14.5c1.6 7.8 6 11.2 14.2 11.5 8 .2 12.7-3.7 14.3-11.8-8.9.7-18.7.2-28.5.3Z"/><path d="M8.5 14.2c3.4-2.6 6.4-2.8 9.4-.7 4-3.2 8.4-2.4 12.8.4M13.5 27.2c4.2-.8 8.7-.6 13.1.1"/><path d="M24.8 6.8c2 2.4.8 4.7-1.1 6.4M16.8 5.2c-2.1 3.1-1 5.4.8 7.2" opacity=".48"/></g> : null}
      {kind === 'medicine' ? <g {...common}><path d="M8.2 12.4c3.7-.4 7.6-.3 11.5.2l-.2 13.1c-3.6.7-7.3.7-11.1.1l-.2-13.4ZM11 8.2c1.9-.3 4-.2 6.2.1l.1 3.8M10 7.2c2.7-.5 5.5-.4 8.2.1"/><path d="m24.2 10.7 8.8 8.1-6.8 7.4-5.5-5.1 7.4-7.5M25.4 13.5l4.9 4.7M23.9 22.3l4.4-4.4"/><path d="M10.8 17.3c2-.4 4-.3 6.1.1M11.1 20.5c1.4-.2 2.8-.2 4.2.1" opacity=".54"/></g> : null}
      {kind === 'materials' ? <g {...common}><path d="m6.7 9.5 23.4-3.2.8 6.1L7.8 15l-1.1-5.5ZM9 18.4l24-2.1.7 6-23.8 2.2-.9-6.1Z"/><path d="M12.8 11.8h.2M26 9.4h.2M15 21.3h.2M29.4 19.5h.2"/><path d="M5.2 24.3c5.7-1.1 8.2 1.1 8.2 4.7m-5.5-6.5-3 2 3.3 1.8" opacity=".6"/></g> : null}
      {kind === 'parts' ? <g {...common}><path d="M20.2 7.2 23 8l1.4 3 3.1.8 2.1-1.3 2.3 2.4-1.5 2.4.8 3.1 2.6 1.5-.9 3.2-3.1.7-1.5 2.7-2.8 1-2-1.7-3.2.1-1.9 2.2-2.8-1.2.2-3.2-2.5-1.7.7-3.1-1.8-2.7 2.1-2.2-.1-3.2Z"/><path d="M18.2 14.2c3.2-2.1 7.2.3 6.6 4-.4 3.4-4.8 4.8-7.1 2.2-1.8-2-1.5-4.7.5-6.2ZM6.5 24.8l8.2-7.1m-6.4 8.9-1.8-1.8 1.7-1.7"/><path d="M27.2 7.6 31.8 4M29.4 10l4.1-3.1" opacity=".48"/></g> : null}
      {kind === 'hope' ? <g {...common}><path d="M20.2 4.8c4.2 5.1 6.1 8.6 4.9 12.4-1 3.8-3 6.8-6.1 9-4.2-2.1-6-5.3-4.8-9.2.9-3 3-5.1 5.9-7.3-.1 3.1.9 5.4 3 6.8"/><path d="M18.9 15.1c2.2 2 3 4.3 2 7.2M7 25c4.2 2.2 8.3 3 12.2 2.8 4.6-.1 9.2-1.4 14-4"/><path d="M9.2 22.3c-2.2-.1-3.3.9-4.3 2M31 21.1c2-.1 3.3.8 4.3 1.8" opacity=".5"/></g> : null}
    </svg>
  );
}
