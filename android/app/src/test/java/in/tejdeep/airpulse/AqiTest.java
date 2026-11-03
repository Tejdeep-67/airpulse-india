package in.tejdeep.airpulse;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import org.junit.Test;

// same cases as src/lib/aqi.test.js, so the app and the website agree
public class AqiTest {

    private static Double[] flat(double v, int n) {
        Double[] a = new Double[n];
        Arrays.fill(a, v);
        return a;
    }

    @Test
    public void subIndexInsideBands() {
        assertEquals(50.0, Aqi.subIndex(Aqi.PM25, 30.0), 1e-9);
        assertEquals(150.0, Aqi.subIndex(Aqi.PM25, 75.0), 1e-9);
        assertEquals(100.0, Aqi.subIndex(Aqi.PM10, 100.0), 1e-9);
        assertEquals(500.0, Aqi.subIndex(Aqi.PM25, 900.0), 1e-9);
    }

    @Test
    public void overallIsTheWorstPollutant() {
        int n = 48;
        Aqi.Result r = Aqi.at(flat(75, n), flat(80, n), flat(20, n), flat(10, n), flat(40, n), flat(500, n), n - 1);
        assertEquals(150, r.aqi);
        assertEquals("PM2.5", r.dominant);
        assertEquals("Moderate", Aqi.NAMES[r.band()]);
    }

    @Test
    public void needsThreePollutantsWithPm() {
        int n = 48;
        assertNull(Aqi.at(flat(75, n), null, null, null, null, null, n - 1));
        assertNull(Aqi.at(null, null, flat(20, n), flat(10, n), flat(40, n), null, n - 1));
    }

    @Test
    public void needs16HoursForA24hAverage() {
        Double[] pm = flat(75, 24);
        for (int i = 0; i < 9; i++) pm[i] = null;
        assertNull(Aqi.avg24(pm, 23));
        pm[8] = 75.0;
        assertEquals(75.0, Aqi.avg24(pm, 23), 1e-9);
    }
}
