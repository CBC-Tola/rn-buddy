import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Button, Text, View } from 'react-native';

// A small component to show how tests work. Test your own components the same way:
// render them, find things like a user would (by their text), press, and check the result.
function Counter() {
  const [count, setCount] = useState(0);
  return (
    <View>
      <Text>Count: {count}</Text>
      <Button title="Add one" onPress={() => setCount(count + 1)} />
    </View>
  );
}

test('pressing the button adds one', async () => {
  await render(<Counter />);
  expect(screen.getByText('Count: 0')).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('Add one'));
  expect(screen.getByText('Count: 1')).toBeOnTheScreen();
});
