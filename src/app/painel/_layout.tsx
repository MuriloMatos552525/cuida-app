import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';

import { colors, font } from '@/lib/theme';

export default function CaregiverTabs() {
  return (
    <Tabs screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: font.semibold },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Pedidos', tabBarIcon: ({ color, size }) => <Ionicons name="briefcase-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="perfil"
        options={{ title: 'Perfil', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
