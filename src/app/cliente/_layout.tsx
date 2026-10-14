import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';

import { colors, font } from '@/lib/theme';

export default function ClientTabs() {
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
        options={{ title: 'Início', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="reservas"
        options={{ title: 'Reservas', tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="conta"
        options={{ title: 'Conta', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
