// Things that only matter inside the Android app (a Capacitor wrapper around this site,
// see android/). On the normal website isApp is false and none of this runs.
import { Capacitor, registerPlugin } from '@capacitor/core'

export const isApp = Capacitor.isNativePlatform()

// native side: android/app/src/main/java/in/tejdeep/airpulse/DailyAqiPlugin.java
export const DailyAqi = registerPlugin('DailyAqi')

export const APK_URL = 'https://github.com/Tejdeep-67/airpulse-india/releases/latest/download/airpulse.apk'
export const APK_SIZE = '4.1 MB'
