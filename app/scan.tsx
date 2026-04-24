import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Input } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { scanBridge } from "@/utils/scanBridge";

export default function ScanScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const incoming = useLocalSearchParams<{ index?: string }>();
  const personaIndex = (() => {
    const n = parseInt(
      typeof incoming.index === "string" ? incoming.index : "0",
      10,
    );
    return Number.isNaN(n) ? 0 : n;
  })();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState<string>("");
  const lockRef = useRef<boolean>(false);

  const handleBarcode = (result: BarcodeScanningResult) => {
    if (lockRef.current) return;
    if (!result.data) return;
    lockRef.current = true;
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => {},
      );
    }
    scanBridge.set(result.data, personaIndex);
    router.back();
  };

  const enviarManual = () => {
    if (!manual.trim()) return;
    scanBridge.set(manual.trim(), personaIndex);
    router.back();
  };

  if (Platform.OS === "web") {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          padding: 16,
          gap: 16,
        }}
      >
        <View
          style={{
            backgroundColor: c.card,
            borderRadius: c.radius,
            padding: 16,
            borderWidth: 1,
            borderColor: c.border,
            gap: 12,
          }}
        >
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_700Bold",
              fontSize: 16,
            }}
          >
            Escaneo no disponible en web
          </Text>
          <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular" }}>
            Pegá manualmente el contenido del código del DNI o usá la app en un
            dispositivo móvil para activar la cámara.
          </Text>
          <TextInput
            placeholder="00000000000@APELLIDO@NOMBRE@..."
            value={manual}
            onChangeText={setManual}
            multiline
            placeholderTextColor={c.mutedForeground}
            style={{
              backgroundColor: c.background,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: c.radius - 4,
              padding: 12,
              minHeight: 100,
              color: c.foreground,
              fontFamily: "Inter_400Regular",
            }}
          />
          <Button title="Procesar" icon="checkmark-outline" onPress={enviarManual} />
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          padding: 16,
          gap: 16,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            backgroundColor: c.card,
            borderRadius: c.radius,
            padding: 20,
            borderWidth: 1,
            borderColor: c.border,
            gap: 12,
            alignItems: "center",
          }}
        >
          <Ionicons name="camera-outline" size={36} color={c.mutedForeground} />
          <Text
            style={{
              color: c.foreground,
              fontFamily: "Inter_700Bold",
              fontSize: 16,
              textAlign: "center",
            }}
          >
            Permiso de cámara requerido
          </Text>
          <Text
            style={{
              color: c.mutedForeground,
              fontFamily: "Inter_400Regular",
              textAlign: "center",
            }}
          >
            Necesitamos acceso a la cámara para leer el código de barras del
            DNI (PDF417).
          </Text>
          <Button
            title="Conceder permiso"
            icon="camera-outline"
            onPress={() => requestPermission()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["pdf417", "qr", "code128", "code39"],
        }}
        onBarcodeScanned={handleBarcode}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.overlay]}
      >
        <View style={styles.frame} />
      </View>
      <View
        style={{
          position: "absolute",
          top: insets.top + 8,
          left: 16,
          right: 16,
          alignItems: "center",
        }}
      >
        <View
          style={{
            backgroundColor: "rgba(0,0,0,0.55)",
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontFamily: "Inter_600SemiBold",
              fontSize: 13,
              letterSpacing: 0.5,
            }}
          >
            Apuntá al código de barras del dorso del DNI
          </Text>
        </View>
      </View>
      <View
        style={{
          position: "absolute",
          bottom: insets.bottom + 24,
          left: 24,
          right: 24,
          gap: 10,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            backgroundColor: "rgba(255,255,255,0.95)",
            borderRadius: c.radius,
            paddingVertical: 14,
            alignItems: "center",
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text
            style={{
              color: c.primary,
              fontFamily: "Inter_700Bold",
              fontSize: 15,
            }}
          >
            Cancelar
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  overlay: {
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    width: "85%",
    height: 180,
    borderWidth: 2,
    borderColor: "#c79a3a",
    borderRadius: 14,
    backgroundColor: "transparent",
  },
});
