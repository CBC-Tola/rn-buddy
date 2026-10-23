If the tabs are your whole app, show them in `App.{tsx}`:

```tsx
import { TabsNavigation } from './src/navigation/Tabs';

export default function App() {
  return <TabsNavigation />;
}
```

If you have a stack from `rn-buddy add navigation`, put the tabs inside it, in `src/navigation/index.{tsx}`,
so other screens (like Details) open on top of the tabs:

```tsx
import { HomeTabs } from './Tabs';

const RootStack = createNativeStackNavigator({
  screens: {
    HomeTabs: { screen: HomeTabs, options: { headerShown: false } },
    Details: DetailsScreen,
  },
});
```

Add a tab: create a screen in `src/screens/`, then add it to `screens` in `src/navigation/Tabs.{tsx}`.
Tab icons: `rn-buddy add icons`, then set `options.tabBarIcon` on a screen.
