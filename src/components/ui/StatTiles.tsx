/**
 * The row of count tiles above a table (Figma 3234:1321): #1b1b1b blocks with
 * a #424242 border, the label in white small caps and the count under it in
 * its colour. 90px tall at 1920; tighter on phones, where the three still sit
 * side by side.
 */
export default function StatTiles({ tiles }: {
  tiles: { label: string; value: number | string; color: string }[]
}) {
  return (
    <div className="grid shrink-0 gap-2.5 sm:gap-4 3xl:gap-[30px]" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}>
      {tiles.map((t) => (
        <div
          key={t.label}
          className="ff-sc min-w-0 rounded-[10px] border border-[#424242] bg-[#1b1b1b] px-2.5 py-2 sm:px-5 sm:py-2.5 3xl:h-[90px] 3xl:px-[25px] 3xl:pt-3 shadow-[0_4px_4px_rgba(0,0,0,0.25)]"
        >
          <p className="truncate text-[11px] leading-tight sm:text-[13px] 3xl:text-[16px] font-bold uppercase text-white">{t.label}</p>
          <p className={`mt-1 3xl:mt-1.5 text-[20px] sm:text-[26px] 3xl:text-[32px] font-bold leading-none ${t.color}`}>{t.value}</p>
        </div>
      ))}
    </div>
  )
}
