import React, { useState } from 'react';

export interface TrendBucket {
  key: string;
  label: string;
  value: number;
}

interface SalesTrendChartProps {
  data: TrendBucket[];
  isHourly: boolean;
}

// Rounds a max value up to a "clean" reference number (x1 / x2 / x2.5 / x5 / x10 of its
// magnitude) so the gridlines read as round numbers instead of an arbitrary max.
const niceMax = (max: number): number => {
  if (max <= 0) return 10000;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= max) return candidate;
  }
  return 10 * magnitude;
};

const PLOT_HEIGHT = 200;

const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ data, isHourly }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0 || total === 0) {
    return (
      <div className="bo-empty" style={{ padding: '36px 0' }}>
        <div className="bo-empty-icon">📈</div>
        <div className="bo-empty-text">해당 기간의 매출 추이 데이터가 없습니다.</div>
      </div>
    );
  }

  const rawMax = Math.max(...data.map(d => d.value));
  const chartMax = niceMax(rawMax);
  const gridSteps = [1, 0.75, 0.5, 0.25, 0];
  const peakIdx = data.reduce((best, d, idx) => (d.value > data[best].value ? idx : best), 0);
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;
  // Thin the x-axis labels so long ranges (e.g. 30 days) don't collide; every bar still renders.
  const labelStride = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="trend-chart">
      <div className="trend-chart-plot" style={{ height: PLOT_HEIGHT }}>
        {/* Recessive reference gridlines, labeled with clean round numbers */}
        <div className="trend-chart-grid">
          {gridSteps.map(step => (
            <div key={step} className="trend-chart-grid-row">
              <span className="trend-chart-grid-label">
                {step === 0 ? '0' : `${Math.round((chartMax * step) / 1000).toLocaleString()}천`}
              </span>
              <span className="trend-chart-grid-line" />
            </div>
          ))}
        </div>

        {/* Bars — anchored to the baseline, grown from a shared max */}
        <div className="trend-chart-bars">
          {data.map((d, idx) => {
            const heightPct = d.value > 0 ? Math.max((d.value / chartMax) * 100, 2) : 0;
            const isPeak = idx === peakIdx && d.value > 0;
            return (
              <div
                key={d.key}
                className="trend-chart-bar-col"
                onMouseEnter={() => setHoverIdx(idx)}
                onMouseLeave={() => setHoverIdx(prev => (prev === idx ? null : prev))}
                onFocus={() => setHoverIdx(idx)}
                onBlur={() => setHoverIdx(prev => (prev === idx ? null : prev))}
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${d.value.toLocaleString()}원`}
              >
                {hoverIdx === idx && (
                  <div className="trend-chart-tooltip">
                    <div className="trend-chart-tooltip-value">{d.value.toLocaleString()}원</div>
                    <div className="trend-chart-tooltip-label">{isHourly ? `${d.label} 시간대` : d.label}</div>
                  </div>
                )}
                {isPeak && !hoverIdx && (
                  <span className="trend-chart-peak-label">{d.value.toLocaleString()}원</span>
                )}
                <div
                  className={`trend-chart-bar ${hoverIdx === idx ? 'is-hovered' : ''} ${isPeak ? 'is-peak' : ''}`}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* X-axis labels — same column widths as the bars above, thinned when dense */}
      <div className="trend-chart-xaxis">
        {data.map((d, idx) => (
          <span key={d.key} className="trend-chart-xaxis-label">
            {idx % labelStride === 0 ? d.label : ''}
          </span>
        ))}
      </div>

      <div className="trend-chart-footer">
        <span>{isHourly ? '시간대별 매출' : '일자별 매출'}</span>
        {hovered ? (
          <span className="trend-chart-footer-active">
            {isHourly ? `${hovered.label} 시간대` : hovered.label} · <strong>{hovered.value.toLocaleString()}원</strong>
          </span>
        ) : (
          <span>기간 합계 <strong>{total.toLocaleString()}원</strong></span>
        )}
      </div>
    </div>
  );
};

export default SalesTrendChart;
