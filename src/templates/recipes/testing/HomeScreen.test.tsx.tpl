import { fireEvent, render, screen } from '@testing-library/react-native';
import { HomeScreen } from '../src/screens/HomeScreen';

// HomeScreen calls useNavigation(), which needs a navigator around it. In a test, a fake is enough.
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// Test like a user: find things by their text, press them, check what happens.
test('shows the title and opens Details', async () => {
  await render(<HomeScreen />);

  expect(screen.getByText('Home')).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('Go to details'));
  expect(mockNavigate).toHaveBeenCalledWith('Details');
});
