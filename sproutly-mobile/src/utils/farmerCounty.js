// The farmer's county, remembered on the phone so it is asked once. The backend also keeps it
// (sent with a check) to route referrals to that county's officers.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'farmerCounty';

export async function loadCounty() {
    try {
        return await AsyncStorage.getItem(KEY);
    } catch {
        return null;
    }
}

export async function saveCounty(county) {
    try {
        await AsyncStorage.setItem(KEY, county);
    } catch {
        // Not saved: the farmer is asked again next time.
    }
}
