package in.tejdeep.airpulse;

/**
 * Same CPCB National AQI maths as src/lib/aqi.js on the website, ported to Java so the
 * daily notification can work it out in the background without opening the app.
 */
public final class Aqi {

    private Aqi() {}

    // upper limit of each band (Good, Satisfactory, Moderate, Poor, Very Poor), above = Severe
    static final double[] PM25 = {30, 60, 90, 120, 250};
    static final double[] PM10 = {50, 100, 250, 350, 430};
    static final double[] NO2 = {40, 80, 180, 280, 400};
    static final double[] SO2 = {40, 80, 380, 800, 1600};
    static final double[] O3 = {50, 100, 168, 208, 748};
    static final double[] CO = {1, 2, 10, 17, 34}; // mg/m3

    private static final int[] INDEX = {0, 50, 100, 200, 300, 400, 500};

    static final String[] NAMES = {"Good", "Satisfactory", "Moderate", "Poor", "Very Poor", "Severe"};
    static final String[] ADVICE = {
        "Great day to be outside. Open the windows.",
        "Fine for most people. Sensitive people can keep long outdoor workouts shorter.",
        "Children, elders and people with asthma should limit long or heavy outdoor activity.",
        "Cut down outdoor exercise. A mask (N95) helps if you are out for long.",
        "Avoid outdoor activity, keep windows closed, use an air purifier if you have one.",
        "Stay indoors as much as possible. People with heart or lung problems should take extra care."
    };

    public static final class Result {
        public final int aqi;
        public final String dominant;

        Result(int aqi, String dominant) {
            this.aqi = aqi;
            this.dominant = dominant;
        }

        public int band() {
            return bandFor(aqi);
        }
    }

    static int bandFor(int aqi) {
        int[] max = {50, 100, 200, 300, 400};
        for (int i = 0; i < max.length; i++) if (aqi <= max[i]) return i;
        return 5;
    }

    static Double subIndex(double[] bp, Double conc) {
        if (conc == null || conc.isNaN() || conc < 0) return null;
        double lo = 0;
        for (int i = 0; i < bp.length; i++) {
            double hi = bp[i];
            if (conc <= hi) return INDEX[i] + (conc - lo) * (INDEX[i + 1] - INDEX[i]) / (hi - lo);
            lo = hi;
        }
        int n = bp.length;
        double width = bp[n - 1] - bp[n - 2];
        return Math.min(500, 400 + (conc - bp[n - 1]) * 100 / width);
    }

    private static Double mean(Double[] s, int from, int to, int minCount) {
        double sum = 0;
        int n = 0;
        for (int i = Math.max(0, from); i <= to && i < s.length; i++) {
            if (s[i] != null && !s[i].isNaN()) {
                sum += s[i];
                n++;
            }
        }
        return n >= minCount ? sum / n : null;
    }

    // 24 h average ending at hour i (needs 16 of 24 hours, like CPCB)
    static Double avg24(Double[] s, int i) {
        if (s == null || i < 0) return null;
        return mean(s, i - 23, i, 16);
    }

    // highest 8 h running average in the 24 h ending at i
    static Double max8hIn24(Double[] s, int i) {
        if (s == null) return null;
        Double best = null;
        for (int end = Math.max(7, i - 23); end <= i; end++) {
            Double m = mean(s, end - 7, end, 6);
            if (m != null && (best == null || m > best)) best = m;
        }
        return best;
    }

    /** AQI at hour i, or null when there isn't enough data (CPCB wants 3 pollutants incl. PM). */
    public static Result at(Double[] pm25, Double[] pm10, Double[] no2, Double[] so2, Double[] o3, Double[] coUg, int i) {
        Double co = max8hIn24(coUg, i);
        if (co != null) co = co / 1000.0; // Open-Meteo gives CO in ug/m3

        String[] keys = {"PM2.5", "PM10", "NO2", "SO2", "O3", "CO"};
        Double[] subs = {
            subIndex(PM25, avg24(pm25, i)),
            subIndex(PM10, avg24(pm10, i)),
            subIndex(NO2, avg24(no2, i)),
            subIndex(SO2, avg24(so2, i)),
            subIndex(O3, max8hIn24(o3, i)),
            subIndex(CO, co)
        };
        int count = 0;
        int best = -1;
        for (int k = 0; k < subs.length; k++) {
            if (subs[k] == null) continue;
            count++;
            if (best < 0 || subs[k] > subs[best]) best = k;
        }
        boolean hasPm = subs[0] != null || subs[1] != null;
        if (count < 3 || !hasPm) return null;
        return new Result((int) Math.round(subs[best]), keys[best]);
    }
}
