import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router';

export function MarketOverviewHero({ market }) {
  const [open, setOpen] = useState(false);
  return <>
    <nav className="market-breadcrumb" aria-label="Breadcrumb"><Link to="/markets/crypto">Markets</Link><span>/</span><span>{market} market</span></nav>
    <header className="market-overview-hero"><h1>{market} market</h1><div className="market-overview-picker"><button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Overview <ChevronDown size={25} strokeWidth={3} /></button>{open && <div className="market-overview-menu" role="menu"><Link role="menuitem" to="/markets/crypto">Crypto market</Link><Link role="menuitem" to="/markets/forex">Forex market</Link><Link role="menuitem" to="/markets/india">India market</Link></div>}</div></header>
  </>;
}

export function MarketOverviewChart({ data = [], color = '#00a784', precision = 5, loading = false, label = 'Market price trend', timezone = 'UTC' }) {
  const hostRef = useRef(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !data.length) return undefined;
    const chart = createChart(host, {
      width: host.clientWidth,
      height: Math.max(280, host.clientHeight),
      layout: { background: { color: '#ffffff' }, textColor: '#667085', fontFamily: 'Arial, sans-serif' },
      localization: { locale: 'en-IN', timeFormatter: (time) => new Intl.DateTimeFormat('en-IN', { timeZone: timezone, dateStyle: 'medium' }).format(new Date(Number(time) * 1000)) },
      grid: { vertLines: { color: '#f1f3f6' }, horzLines: { color: '#f1f3f6' } },
      rightPriceScale: { borderColor: '#e6e8ec' },
      timeScale: { borderColor: '#e6e8ec', timeVisible: false },
      crosshair: { vertLine: { color: '#aeb6c2', labelBackgroundColor: color }, horzLine: { color: '#aeb6c2', labelBackgroundColor: color } },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true }
    });
    const series = chart.addAreaSeries({
      lineColor: color,
      topColor: `${color}3b`,
      bottomColor: `${color}00`,
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision, minMove: 10 ** -precision }
    });
    const points = data.filter((point) => Number.isFinite(Number(point.value)) && Number(point.value) > 0)
      .map((point) => ({ time: Math.floor(Number(point.time) / 1000), value: Number(point.value) }))
      .filter((point) => Number.isFinite(point.time))
      .sort((a, b) => a.time - b.time)
      .filter((point, index, all) => index === 0 || point.time > all[index - 1].time);
    series.setData(points);
    chart.timeScale().fitContent();
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) chart.applyOptions({ width: Math.max(300, entries[0].contentRect.width), height: Math.max(280, entries[0].contentRect.height) });
    });
    observer.observe(host);
    return () => { observer.disconnect(); chart.remove(); };
  }, [data, color, precision, timezone]);

  if (loading && !data.length) return <div className="market-overview-chart-state" role="status">Loading real market history…</div>;
  if (!data.length) return <div className="market-overview-chart-state">Historical market data is unavailable.</div>;
  return <div className="market-overview-chart" ref={hostRef} role="img" aria-label={label} />;
}
