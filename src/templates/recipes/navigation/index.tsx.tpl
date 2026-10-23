import { createStaticNavigation } from '@react-navigation/native';
import type { StaticParamList } from '@react-navigation/native'; <!-- ts -->
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DetailsScreen } from '../screens/DetailsScreen';
import { HomeScreen } from '../screens/HomeScreen';

// Every screen you can navigate to. The first one is shown when the app starts.
const RootStack = createNativeStackNavigator({
  screens: {
    Home: HomeScreen,
    Details: DetailsScreen,
  },
});

// Render <Navigation /> once, in App.{tsx}.
export const Navigation = createStaticNavigation(RootStack);
<!-- ts -->
// Lets TypeScript check screen names, e.g. navigation.navigate('Details'). <!-- ts -->
type RootStackParamList = StaticParamList<typeof RootStack>; <!-- ts -->
<!-- ts -->
declare global { <!-- ts -->
  namespace ReactNavigation { <!-- ts -->
    interface RootParamList extends RootStackParamList {} <!-- ts -->
  } <!-- ts -->
} <!-- ts -->
