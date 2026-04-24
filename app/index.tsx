import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Input, Section, Segmented, StepperSelect } from "@/components/ui";
import { useColors } from "@/hooks/useColors";
import { scanBridge } from "@/utils/scanBridge";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type AppSettings,
} from "@/utils/settings";
import { buscarVehiculos } from "@/utils/vehiculos";
import { buscarCiudades } from "@/utils/ciudades";
import {
  frasePardada,
  narrativaPatrullaje,
  PARADA_LABEL,
  PARADA_TIPOS,
  sugerirParadaTipo,
  type ParadaTipo,
} from "@/utils/parada";
import { buscarPOIsCercanos, type POI } from "@/utils/poi";

type Persona = {
  apellido: string;
  nombre: string;
  dni: string;
  nacimiento: string;
  domicilio: string;
  genero: "Masculino" | "Femenina";
};

type Modo = "PATRULLAJE" | "CONTROL VEHICULAR" | "PARADA";
type Tipo = "" | "INTELIGENTE" | "INTERFUERZA";
type Zona = "INTERIOR" | "CAPITAL";
type Resultado = "NEGATIVO" | "POSITIVO";

const personaVacia = (): Persona => ({
  apellido: "",
  nombre: "",
  dni: "",
  nacimiento: "",
  domicilio: "",
  genero: "Masculino",
});

const calcularEdad = (fecha: string): string => {
  if (!fecha || !fecha.includes("/")) return "";
  const [d, m, a] = fecha.split("/").map(Number);
  if (!d || !m || !a) return "";
  const hoy = new Date();
  let edad = hoy.getFullYear() - a;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) edad--;
  return edad > 0 ? String(edad) : "";
};

const PALABRA_GRUPO: Record<number, string> = {
  2: "Ambos",
  3: "Los tres",
  4: "Los cuatro",
  5: "Los cinco",
  6: "Los seis",
  7: "Los siete",
  8: "Los ocho",
  9: "Los nueve",
  10: "Los diez",
};

const formatearEdades = (eds: string[]): string => {
  if (eds.length === 0) return "";
  if (eds.length === 1) return `${eds[0]} años`;
  const allEqual = eds.every((e) => e === eds[0]);
  if (allEqual) {
    const palabra = PALABRA_GRUPO[eds.length] ?? `Los ${eds.length}`;
    return `${palabra} ${eds[0]} años`;
  }
  if (eds.length === 2) return `${eds[0]} y ${eds[1]} años`;
  return `${eds.slice(0, -1).join(", ")} y ${eds[eds.length - 1]} años`;
};

// Capitaliza solo la primera letra y deja el resto en minúsculas
const sentenceCase = (s: string): string => {
  const t = s.trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
};

// Parser DNI argentino (PDF417)
const parseDniArgentino = (raw: string): Partial<Persona> => {
  if (!raw) return {};
  const parts = raw.split("@");
  if (parts.length < 5) return { dni: raw };
  const out: Partial<Persona> = {};
  const apellido = parts[1]?.trim();
  const nombre = parts[2]?.trim();
  const sexo = parts[3]?.trim().toUpperCase();
  const dni = parts[4]?.trim();
  if (apellido) out.apellido = apellido;
  if (nombre) out.nombre = nombre;
  if (sexo === "F") out.genero = "Femenina";
  else if (sexo === "M") out.genero = "Masculino";
  if (dni) out.dni = dni.replace(/^0+/, "");
  for (const p of parts) {
    const m = p.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) {
      out.nacimiento = `${m[1]}/${m[2]}/${m[3]}`;
      break;
    }
  }
  return out;
};

const construirTitulo = (modo: Modo, tipo: Tipo, zona: Zona): string => {
  let cabecera: string;
  if (modo === "PARADA") {
    cabecera = "PATRULLAJE INTELIGENTE";
  } else if (tipo === "INTERFUERZA") {
    cabecera = "CONTROL VEHICULAR INTERFUERZA";
  } else {
    cabecera = "PATRULLAJE INTELIGENTE";
  }
  return `*${cabecera} ${zona}*`;
};

const formatearResultado = (r: Resultado, detalle: string): string => {
  if (r === "NEGATIVO") return "Negativo.";
  const det = detalle.trim().toLowerCase();
  return det ? `Positivo ${det}.` : "Positivo.";
};

const reporteOficial = (
  d: {
    modo: Modo;
    tipo: Tipo;
    zona: Zona;
    ciudad: string;
    nroProcedimiento: string;
    lugarControl: string;
    resultado: Resultado;
    detalleResultado: string;
    vehiculo: string;
    dominio: string;
    paradaTipo: ParadaTipo;
    paradaNombre: string;
  },
  personas: Persona[],
) => {
  const h1 = construirTitulo(d.modo, d.tipo, d.zona);
  const h2 = `*COMPAÑÍA DE INTERVENCIONES ESPECIALES -CIE-*`;
  const h3 = `*${d.ciudad.toUpperCase()}*`;
  const masc = personas.filter((p) => p.genero === "Masculino").length;
  const fem = personas.filter((p) => p.genero === "Femenina").length;
  let conteo = "";
  if (masc > 0) conteo += `${String(masc).padStart(2, "0")} ${masc === 1 ? "masculino" : "masculinos"}`;
  if (masc > 0 && fem > 0) conteo += " y ";
  if (fem > 0) conteo += `${String(fem).padStart(2, "0")} ${fem === 1 ? "femenina" : "femeninas"}`;
  const eds = personas.map((p) => calcularEdad(p.nacimiento)).filter(Boolean);
  const edsLine = eds.length > 0 ? `\n*EDAD:* ${formatearEdades(eds)}.` : "";

  const lines: string[] = [h1, "", h2, "", h3, ""];

  if (d.modo === "PARADA") {
    lines.push(narrativaPatrullaje(d.paradaTipo, d.paradaNombre));
    return lines.join("\n");
  }

  // PATRULLAJE y CONTROL VEHICULAR (formato detallado)
  if (conteo) lines.push(`*CONTROL:* ${conteo}.${edsLine}`);
  if (d.lugarControl.trim()) lines.push(`*LUGAR DEL CONTROL:* ${d.lugarControl}.`);
  if (d.vehiculo.trim()) lines.push(`*VEHÍCULO:* ${d.vehiculo}.`);
  if (d.dominio.trim()) lines.push(`*DOMINIO:* ${d.dominio.toUpperCase()}.`);
  lines.push(`*CONTROL:* ${formatearResultado(d.resultado, d.detalleResultado)}`);
  lines.push(`*SISTEMA ELIOT:* Sin sistema.`);
  lines.push(`*Nro. Procedimiento:* ${d.nroProcedimiento}`);
  return lines.join("\n");
};

const reportePersona = (p: Persona): string => {
  const edad = calcularEdad(p.nacimiento);
  return [
    `*APELLIDO:* ${(p.apellido || "-").toUpperCase()}.`,
    `*NOMBRE:* ${(p.nombre || "-").toUpperCase()}.`,
    `*DNI:* ${p.dni || "-"}.`,
    `*EDAD:* ${edad ? `${edad} años` : "-"}.`,
    `*DOMICILIO:* ${(p.domicilio || "-").toUpperCase()}.`,
  ].join("\n");
};

const openWhatsApp = async (phone: string, text: string) => {
  if (!phone) {
    Alert.alert(
      "Falta el número",
      "Configurá el número de WhatsApp en Configuración antes de enviar.",
    );
    return;
  }
  const url = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(text)}`;
  const fallback = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  try {
    const can = await Linking.canOpenURL(url);
    await Linking.openURL(can ? url : fallback);
  } catch {
    await Linking.openURL(fallback);
  }
};

export default function HomeScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const settingsHydrated = useRef(false);

  const [modo, setModo] = useState<Modo>("PATRULLAJE");
  const [tipo, setTipo] = useState<Tipo>("INTELIGENTE");
  const [zona, setZona] = useState<Zona>("INTERIOR");
  const [ciudad, setCiudad] = useState(DEFAULT_SETTINGS.ciudad);
  const [proc, setProc] = useState("");
  const [lugar, setLugar] = useState("");
  const [resultado, setResultado] = useState<Resultado>("NEGATIVO");
  const [detalleResultado, setDetalleResultado] = useState("infracción a la ley 23.737");
  const [cantidad, setCantidad] = useState("01");
  const [vehiculo, setVehiculo] = useState("");
  const [dominio, setDominio] = useState("");
  const [paradaTipo, setParadaTipo] = useState<ParadaTipo>("PLAZA");
  const [paradaNombre, setParadaNombre] = useState("");
  const [personas, setPersonas] = useState<Persona[]>([personaVacia()]);
  const [locating, setLocating] = useState(false);
  const [pois, setPois] = useState<POI[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);

  // Ajustar tipo cuando cambia modo
  useEffect(() => {
    if (modo === "CONTROL VEHICULAR" && tipo === "INTELIGENTE") setTipo("");
    if ((modo === "PATRULLAJE" || modo === "PARADA") && tipo === "") setTipo("INTELIGENTE");
  }, [modo, tipo]);

  // Fetch settings al enfocar
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadSettings().then((next) => {
        if (!active) return;
        setSettings(next);
        setCiudad(next.ciudad);
        setProc(next.proc);
        setLugar(next.lugarControl);
        settingsHydrated.current = true;
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // Sincronización bidireccional (Ciudad / Nro. Procedimiento / Lugar del control)
  useEffect(() => {
    if (!settingsHydrated.current) return;
    if (
      ciudad === settings.ciudad &&
      proc === settings.proc &&
      lugar === settings.lugarControl
    )
      return;
    const t = setTimeout(() => {
      const next = { ...settings, ciudad, proc, lugarControl: lugar };
      setSettings(next);
      saveSettings(next).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [ciudad, proc, lugar, settings]);

  // Ajustar cantidad de personas
  useEffect(() => {
    const n = parseInt(cantidad, 10);
    setPersonas((prev) => {
      if (prev.length === n) return prev;
      if (prev.length < n) {
        return [...prev, ...Array(n - prev.length).fill(null).map(personaVacia)];
      }
      return prev.slice(0, n);
    });
  }, [cantidad]);

  // Consumir resultado del scan
  useFocusEffect(
    useCallback(() => {
      const p = scanBridge.consume();
      if (!p) return;
      const parsed = parseDniArgentino(p.data);
      setPersonas((prev) =>
        prev.map((pers, i) => (i === p.index ? { ...pers, ...parsed } : pers)),
      );
    }, []),
  );

  const pedirGps = async () => {
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        Alert.alert(
          "Permiso denegado",
          "Necesitamos permiso de ubicación para obtener el lugar del control.",
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      // CONTROL VEHICULAR: el lugar es PERSISTENTE (puesto fijo) → GPS no lo toca.
      // PATRULLAJE: el lugar es DINÁMICO → actualiza solo calle y altura, no la ciudad.
      // PARADA: solo dispara el radar de POIs, no toca lugar ni ciudad.
      if (modo === "PATRULLAJE") {
        const adr = await Location.reverseGeocodeAsync(loc.coords);
        const a = adr[0];
        if (a) {
          const partes = [a.street, a.streetNumber || a.name].filter(Boolean).join(" ");
          if (partes) setLugar(partes);
        }
      }
      if (modo === "PARADA") {
        setPoiLoading(true);
        try {
          const lista = await buscarPOIsCercanos(loc.coords.latitude, loc.coords.longitude, 500);
          setPois(lista);
        } finally {
          setPoiLoading(false);
        }
      }
    } catch {
      Alert.alert("Error", "No se pudo obtener la ubicación.");
    } finally {
      setLocating(false);
    }
  };

  const enviarReporte = () => {
    const texto = reporteOficial(
      {
        modo,
        tipo,
        zona,
        ciudad,
        nroProcedimiento: proc,
        lugarControl: lugar,
        resultado,
        detalleResultado,
        vehiculo,
        dominio,
        paradaTipo,
        paradaNombre,
      },
      personas,
    );
    openWhatsApp(settings.phone, texto);
  };

  const enviarSoloDatos = (p: Persona) => {
    openWhatsApp(settings.phone, reportePersona(p));
  };

  const updatePersona = (idx: number, patch: Partial<Persona>) => {
    setPersonas((prev) => prev.map((pt, i) => (i === idx ? { ...pt, ...patch } : pt)));
  };

  const tipoOptions: Tipo[] =
    modo === "CONTROL VEHICULAR" ? ["", "INTERFUERZA"] : ["INTELIGENTE", "INTERFUERZA"];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      {/* Header institucional */}
      <View
        style={{
          paddingTop: insets.top + 10,
          paddingBottom: 14,
          paddingHorizontal: 16,
          backgroundColor: c.background,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#000",
            borderWidth: 2,
            borderColor: c.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="shield" size={22} color={c.accent} />
        </View>
        <Text
          style={{
            color: "#000",
            fontFamily: "Inter_700Bold",
            fontSize: 20,
            letterSpacing: 1.2,
            flex: 1,
            textAlign: "center",
          }}
        >
          CIE CONTROL
        </Text>
        <Pressable
          onPress={() => router.push("/settings")}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000",
            borderWidth: 2,
            borderColor: c.accent,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Ionicons name="settings-outline" size={20} color={c.accent} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Section title="Servicio" icon="git-branch-outline">
          <Segmented
            label="Tipo de Servicio"
            value={modo}
            options={["PATRULLAJE", "CONTROL VEHICULAR", "PARADA"]}
            onChange={(v) => setModo(v as Modo)}
            renderOption={(opt) => (opt === "CONTROL VEHICULAR" ? "C. VEHICULAR" : opt)}
          />
        </Section>

        <Section
          title={
            modo === "PATRULLAJE"
              ? "Patrullaje"
              : modo === "CONTROL VEHICULAR"
                ? "Control Vehicular"
                : "Parada Preventiva"
          }
          icon="shield-outline"
        >
          <Segmented
            label={modo === "CONTROL VEHICULAR" ? "Tipo (opcional)" : "Tipo"}
            value={tipo}
            options={tipoOptions as string[]}
            onChange={(v) => setTipo(v as Tipo)}
            renderOption={(opt) => (opt === "" ? "NINGUNO" : opt)}
          />
          <Segmented
            label="Zona"
            value={zona}
            options={["INTERIOR", "CAPITAL"]}
            onChange={(v) => setZona(v as Zona)}
          />
          <View style={{ gap: 6 }}>
            <Input label="Ciudad" value={ciudad} onChangeText={setCiudad} />
            {(() => {
              const sug = buscarCiudades(ciudad);
              const exacto = sug.length === 1 && sug[0]!.toLowerCase() === ciudad.trim().toLowerCase();
              if (sug.length === 0 || exacto) return null;
              return (
                <View
                  style={{
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "rgba(212, 175, 55, 0.5)",
                    borderRadius: c.radius - 4,
                    overflow: "hidden",
                  }}
                >
                  {sug.map((s, i) => (
                    <Pressable
                      key={s}
                      onPress={() => setCiudad(s)}
                      style={({ pressed }) => ({
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: pressed ? "#FAF3DD" : "transparent",
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderColor: "#EEE",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      })}
                    >
                      <Ionicons name="location-outline" size={16} color={c.accent} />
                      <Text style={{ color: c.foreground, fontFamily: "Inter_500Medium", fontSize: 14 }}>
                        {s}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              );
            })()}
          </View>
          <Input label="N° Procedimiento" value={proc} onChangeText={setProc} />
        </Section>

        {modo === "PARADA" ? (
          <Section title="Lugar de la Parada" icon="flag-outline">
            <Button
              title={
                locating
                  ? "Localizando..."
                  : poiLoading
                    ? "Buscando lugares cercanos..."
                    : "Detectar lugar (GPS)"
              }
              icon="navigate-outline"
              onPress={pedirGps}
              disabled={locating || poiLoading}
            />

            {pois.length > 0 ? (
              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    color: c.mutedForeground,
                    fontFamily: "Inter_600SemiBold",
                    fontSize: 12,
                    letterSpacing: 0.6,
                  }}
                >
                  SUGERENCIAS CERCANAS
                </Text>
                <View
                  style={{
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "rgba(212, 175, 55, 0.5)",
                    borderRadius: c.radius - 4,
                    overflow: "hidden",
                  }}
                >
                  {pois.map((p, i) => (
                    <Pressable
                      key={`${p.tipo}-${p.nombre}-${i}`}
                      onPress={() => {
                        setParadaTipo(p.tipo);
                        setParadaNombre(p.nombre);
                      }}
                      style={({ pressed }) => ({
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: pressed ? "#FAF3DD" : "transparent",
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderColor: "#EEE",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      })}
                    >
                      <Ionicons
                        name={
                          p.tipo === "PLAZA" || p.tipo === "PARQUE"
                            ? "leaf-outline"
                            : p.tipo === "IGLESIA" || p.tipo === "CAPILLA"
                              ? "business-outline"
                              : p.tipo === "HOSPITAL"
                                ? "medkit-outline"
                                : p.tipo === "TERMINAL"
                                  ? "bus-outline"
                                  : "trail-sign-outline"
                        }
                        size={16}
                        color={c.accent}
                      />
                      <Text
                        style={{
                          color: c.foreground,
                          fontFamily: "Inter_600SemiBold",
                          fontSize: 14,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {PARADA_LABEL[p.tipo]} {p.nombre}
                      </Text>
                      <Text
                        style={{
                          color: c.mutedForeground,
                          fontFamily: "Inter_400Regular",
                          fontSize: 12,
                        }}
                      >
                        {p.distancia < 1000 ? `${p.distancia} m` : `${(p.distancia / 1000).toFixed(1)} km`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Segmented
              label="Tipo de Lugar"
              value={paradaTipo}
              options={PARADA_TIPOS as string[]}
              onChange={(v) => setParadaTipo(v as ParadaTipo)}
              renderOption={(opt) => PARADA_LABEL[opt as ParadaTipo]}
            />
            <Input
              label={
                paradaTipo === "INGRESO"
                  ? "Ciudad / acceso"
                  : `Nombre de ${PARADA_LABEL[paradaTipo].toLowerCase()}`
              }
              value={paradaNombre}
              onChangeText={setParadaNombre}
              placeholder={
                paradaTipo === "INGRESO"
                  ? "Ej: Villa Carlos Paz"
                  : paradaTipo === "PLAZA"
                    ? "Ej: Independencia"
                    : "Ej: San Miguel"
              }
            />
            <View
              style={{
                backgroundColor: "#FAF3DD",
                borderRadius: c.radius - 4,
                padding: 10,
                borderWidth: 1,
                borderColor: "rgba(212, 175, 55, 0.5)",
              }}
            >
              <Text style={{ color: c.foreground, fontFamily: "Inter_500Medium", fontSize: 13 }}>
                {narrativaPatrullaje(paradaTipo, paradaNombre)}
              </Text>
            </View>
          </Section>
        ) : null}

        {modo !== "PARADA" ? (
          <Section title="Ubicación" icon="location-outline">
            <Input
              label={
                modo === "CONTROL VEHICULAR"
                  ? "Lugar del control (fijo, manual)"
                  : "Lugar del control"
              }
              value={lugar}
              onChangeText={setLugar}
              placeholder={
                modo === "CONTROL VEHICULAR" ? "Ej: Ruta 9 km 630" : "Calle y altura"
              }
            />
            {modo === "PATRULLAJE" ? (
              <Button
                title={locating ? "Localizando..." : "Obtener GPS"}
                icon="navigate-outline"
                onPress={pedirGps}
                disabled={locating}
              />
            ) : null}
          </Section>
        ) : null}

        {modo !== "PARADA" ? (
        <Section title="Control" icon="checkbox-outline">
          <Segmented
            label="Resultado"
            value={resultado}
            options={["NEGATIVO", "POSITIVO"]}
            onChange={(v) => setResultado(v as Resultado)}
          />
          {resultado === "POSITIVO" ? (
            <Input
              label="Detalle del positivo"
              value={detalleResultado}
              onChangeText={setDetalleResultado}
              placeholder="infracción a la ley 23.737"
            />
          ) : null}
          <StepperSelect
            label="Personas"
            value={cantidad}
            options={["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]}
            onChange={setCantidad}
          />
          <View style={{ gap: 6 }}>
            <Input label="Vehículo" value={vehiculo} onChangeText={setVehiculo} placeholder="Ej: Renault Kangoo" />
            {(() => {
              const sug = buscarVehiculos(vehiculo);
              const exacto = sug.length === 1 && sug[0]!.full.toLowerCase() === vehiculo.trim().toLowerCase();
              if (sug.length === 0 || exacto) return null;
              return (
                <View
                  style={{
                    backgroundColor: "#fff",
                    borderWidth: 1,
                    borderColor: "rgba(212, 175, 55, 0.5)",
                    borderRadius: c.radius - 4,
                    overflow: "hidden",
                  }}
                >
                  {sug.map((s, i) => (
                    <Pressable
                      key={s.full}
                      onPress={() => setVehiculo(s.full)}
                      style={({ pressed }) => ({
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: pressed ? "#FAF3DD" : "transparent",
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderColor: "#EEE",
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      })}
                    >
                      <Ionicons name="car-outline" size={16} color={c.accent} />
                      <Text style={{ color: c.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 }}>
                        {s.marca}
                      </Text>
                      <Text style={{ color: c.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14 }}>
                        {s.modelo}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              );
            })()}
          </View>
          {modo === "CONTROL VEHICULAR" ? (
            <Input
              label="Dominio"
              value={dominio}
              onChangeText={setDominio}
              placeholder="AB123CD"
              autoCapitalize="characters"
            />
          ) : null}
        </Section>
        ) : null}

        {modo !== "PARADA" ? personas.map((p, idx) => {
          const edad = calcularEdad(p.nacimiento);
          return (
            <Section key={idx} title={`Persona ${idx + 1}`} icon="person-outline">
              <Button
                title="Escanear DNI"
                icon="camera-outline"
                onPress={() => router.push({ pathname: "/scan", params: { index: String(idx) } })}
              />
              <Segmented
                label="Género"
                value={p.genero}
                options={["Masculino", "Femenina"]}
                onChange={(v) => updatePersona(idx, { genero: v as Persona["genero"] })}
              />
              <Input label="Apellido" value={p.apellido} onChangeText={(t) => updatePersona(idx, { apellido: t })} />
              <Input label="Nombre" value={p.nombre} onChangeText={(t) => updatePersona(idx, { nombre: t })} />
              <Input label="DNI" value={p.dni} onChangeText={(t) => updatePersona(idx, { dni: t })} keyboardType="number-pad" />
              <View style={{ gap: 4 }}>
                <Input
                  label="Nacimiento"
                  value={p.nacimiento}
                  placeholder="DD/MM/AAAA"
                  onChangeText={(t) => updatePersona(idx, { nacimiento: t })}
                />
                {edad ? (
                  <Text style={{ color: c.success, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                    (Edad: {edad} años)
                  </Text>
                ) : null}
              </View>
              <Input
                label="Domicilio"
                value={p.domicilio}
                placeholder="Calle, número, barrio"
                onChangeText={(t) => updatePersona(idx, { domicilio: t })}
              />
              <Pressable
                onPress={() => enviarSoloDatos(p)}
                style={({ pressed }) => ({
                  marginTop: 4,
                  backgroundColor: c.accent,
                  borderRadius: c.radius,
                  paddingVertical: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Ionicons name="logo-whatsapp" size={18} color="#000" />
                <Text style={{ color: "#000", fontFamily: "Inter_700Bold", fontSize: 14, letterSpacing: 0.5 }}>
                  ENVIAR SOLO DATOS
                </Text>
              </Pressable>
            </Section>
          );
        }) : null}

        <Button
          title="ENVIAR REPORTE"
          variant="success"
          icon="logo-whatsapp"
          onPress={enviarReporte}
        />
      </ScrollView>
    </View>
  );
}

const _styles = StyleSheet.create({});
export { _styles, sentenceCase };
