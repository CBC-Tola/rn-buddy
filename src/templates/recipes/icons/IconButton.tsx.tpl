import { Ionicons } from '@react-native-vector-icons/ionicons/static'; <!-- cli -->
import { Ionicons } from '@react-native-vector-icons/ionicons'; <!-- expo -->
import type { ComponentProps } from 'react'; <!-- ts -->
import { Pressable, StyleSheet, Text } from 'react-native';

type Props = { <!-- ts -->
  icon: ComponentProps<typeof Ionicons>['name']; // TypeScript knows every icon name <!-- ts -->
  label: string; <!-- ts -->
  onPress: () => void; <!-- ts -->
}; <!-- ts -->
<!-- ts -->
// An example: a button with an icon. Browse the icon names at https://ionic.io/ionicons
export function IconButton({ icon, label, onPress }{: Props}) {
  return (
    <Pressable style={styles.button} onPress={onPress}>
      <Ionicons name={icon} size={20} color="#fff" />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, backgroundColor: '#2563eb' },
  label: { color: '#fff', fontWeight: '600' },
});
