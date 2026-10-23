import { createDrawerNavigator } from '@react-navigation/drawer';
import { createStaticNavigation } from '@react-navigation/native';
import type { StaticParamList } from '@react-navigation/native'; <!-- ts -->
import { FeedScreen } from '../screens/FeedScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

// One menu item per screen. Swipe from the left edge, or tap the menu button in the header, to open it.
export const MainDrawer = createDrawerNavigator({
  screens: {
    Feed: FeedScreen,
    Settings: SettingsScreen,
  },
});

// Use this when the drawer is your whole app: render <DrawerNavigation /> once, in App.{tsx}.
export const DrawerNavigation = createStaticNavigation(MainDrawer);
<!-- ts -->
// Lets TypeScript check screen names, e.g. navigation.navigate('Settings'). <!-- ts -->
export type MainDrawerParamList = StaticParamList<typeof MainDrawer>; <!-- ts -->
