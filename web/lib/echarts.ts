// Only the ECharts pieces StatGarden uses, so the bundle stays small.
import { BarChart, HeatmapChart, LineChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer, SVGRenderer } from "echarts/renderers";

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  LabelLayout,
  CanvasRenderer,
  SVGRenderer,
]);

export { echarts };
export type { EChartsType } from "echarts/core";
