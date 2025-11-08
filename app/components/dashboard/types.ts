export type IndexRow = {
  id: number;
  name: string;
  ticker: string;
  price: number;
  coins: number;
  ["24_h"]: number;
  ["7_d"]: number;
  ["1_m"]: number;
  ["24_h_volume"]: number;
  index_grade: number;
  all_time: number;
  market_cap: number;
  top_gainers_icons?: Record<
    string,
    { name: string; large: string; small: string; thumb: string }
  >;
};

export type IndicesResponse = {
  success: boolean;
  message: string;
  data: IndexRow[];
};

export type PerfRow = {
  id: number;
  date: string;
  index_cumulative_roi: number;
  market_cap: number;
  volume: number;
  fdv: number;
};

export type PerfResponse = {
  success: boolean;
  message: string;
  data: PerfRow[];
};

