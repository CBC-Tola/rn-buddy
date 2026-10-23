import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStaticNavigation } from '@react-navigation/native';
import type { StaticParamList } from '@react-navigation/native'; <!-- ts -->
import { FeedScreen } from '../screens/FeedScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

// One tab per screen, in this order. The tab bar shows the screen names.
export const HomeTabs = createBottomTabNavigator({
  screens: {
    Feed: FeedScreen,
    Settings: SettingsScreen,
  },
});

// Use this when the tabs are your whole app: render <TabsNavigation /> once, in App.{tsx}.
// If you already have a stack (rn-buddy add navigation), put HomeTabs inside it instead (see the next steps).
export const TabsNavigation = createStaticNavigation(HomeTabs);
<!-- ts -->
// Lets TypeScript check tab names, e.g. navigation.navigate('Settings'). <!-- ts -->
export type HomeTabsParamList = StaticParamList<typeof HomeTabs>; <!-- ts -->
