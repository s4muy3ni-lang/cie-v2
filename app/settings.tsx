import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Input, Section } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/utils/settings";

export default function SettingsScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [s, setS] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    loadSettings().then(setS);
  }, []);

  const onSave = async () => {
    setSaving(true);
    try {
      await saveSettings({
        ...s,
        phone: s.phone.replace(/\D/g, ""),
      });
      setSavedAt(Date.now());
      setTimeout(() => router.back(), 350);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingBottom: 14,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: c.card,
          borderBottomWidth: 1,
          borderBottomColor: c.border,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="chevron-back" size={22} color={c.primary} />
          <Text style={{ color: c.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 }}>
            Volver
          </Text>
        </Pressable>
        <Text style={{ color: c.foreground, fontFamily: "Inter_700Bold", fontSize: 16 }}>
          CONFIGURACIÓN
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        <Section title="Datos por defecto" icon="settings-outline">
          <Input
            label="Número de Reporte (WhatsApp)"
            value={s.phone}
            onChangeText={(t) => setS((p) => ({ ...p, phone: t.replace(/[^\d+]/g, "") }))}
            placeholder="5493510000000"
            keyboardType="phone-pad"
          />
          <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12 }}>
            Sin signos ni espacios. Incluí el código de país (54 para Argentina).
          </Text>
          <Input
            label="Ciudad Predeterminada"
            value={s.ciudad}
            onChangeText={(t) => setS((p) => ({ ...p, ciudad: t }))}
            placeholder="Córdoba"
          />
          <Input
            label="N° Procedimiento Base"
            value={s.proc}
            onChangeText={(t) => setS((p) => ({ ...p, proc: t }))}
            placeholder="Ej: 1234/26"
          />
        </Section>

        <Button
          title={saving ? "Guardando..." : "GUARDAR CONFIGURACIÓN"}
          icon="save-outline"
          onPress={onSave}
          disabled={saving}
        />
        {savedAt ? (
          <Text
            style={{
              marginTop: 12,
              color: c.success,
              fontFamily: "Inter_500Medium",
              fontSize: 13,
              textAlign: "center",
            }}
          >
            Guardado correctamente
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
