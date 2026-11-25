// Contrato compartido entre las dos mitades del frontend (propuesta de partida).
// Sin backend: estas funciones se implementan en el cliente con datos simulados.

export type Preferences = {
  interests: string[];        // arquitectura, gastronomia, museos, naturaleza,
                              // historia, compras, vida_nocturna, arte_urbano
  pace: "relajado" | "equilibrado" | "intenso";
  transport: ("a_pie" | "transporte_publico" | "coche" | "bici")[];
  company: "solo" | "pareja" | "con_ninos" | "grupo";
  budget: "bajo" | "medio" | "alto";
  needs: string[];
};

export type RouteRequest = {
  city: string;
  date: string;                               // AAAA-MM-DD
  timeWindow: { from: string; to: string };   // HH:MM
  start: { label: string };
  mustInclude: string[];
  overrides?: Partial<Preferences>;           // solo para esta ruta
};

export type Stop = {
  order: number; placeId: string; name: string;
  arrive: string; visitMinutes: number;
  travelToNext?: { mode: string; minutes: number; note?: string };
  locked: boolean;
  lat?: number;
  lon?: number;
  area?: string;
  photo?: string;
  hours?: string;
  price?: string;
  rating?: number;
  reviewsCount?: number;
  address?: string;
  googleMapsUrl?: string;
  partner?: boolean;
  partnerPerk?: string;
};

export type Route = {
  id: string; name: string; request: RouteRequest;
  stops: Stop[]; version: number; saved: boolean; favorite: boolean;
};

export type AssistantReply = {
  kind: "question" | "summary" | "change";
  text: string;
  options?: { label: string; value: string; multiple?: boolean }[];
  request?: RouteRequest;   // en "summary"
  changes?: string[];       // en "change"
};

// Añadido en feature 2: ajustes de la cuenta (avisos).
export type AccountSettings = { remindDayBefore: boolean; remindToRate: boolean };

// Añadido en feature 4: acceso con proveedores externos.
export type AuthProvider = "google" | "apple";

export type Session = {
  kind: "guest" | "account";
  name?: string;
  email?: string;
  settings?: AccountSettings;      // Añadido en feature 2: solo para cuentas; por defecto { true, true }
  emailVerified?: boolean;         // Añadido en feature 4: solo cuentas; undefined = la verificación no está activa
};

// Añadido en feature 2: valoración de una ruta (estrellas, me gusta por parada y comentario).
export type Rating = { stars: number; stops: Record<number, boolean>; comment?: string };

export type RefineAction =
  | { type: "quick"; value: "menos_caminar" | "mas_comida" | "mas_barato" | "anadir_pausa" }
  | { type: "remove_stop" | "lock_stop"; order: number }
  | { type: "swap_stop"; order: number; placeId: string }
  | { type: "move_stop"; order: number; to: number }   // Añadido en la versión de escritorio (plan feature-3-version-de-escritorio): reordenar paradas (pendiente en el backend)
  | { type: "text"; value: string };

export type Place = {
  id: string; name: string; categories: string[];
  why?: string; hours?: string; price?: string; photo?: string;
  rating?: number; reviewsCount?: number; address?: string; googleMapsUrl?: string;
  lat?: number; lon?: number; area?: string; partner?: boolean; partnerPerk?: string;
};

// Responsable: spec 2 (módulo de datos simulados)
export interface DataModule {
  getPreferences(): Promise<Preferences | null>;
  savePreferences(p: Preferences): Promise<void>;
  getSession(): Promise<Session>;
  register(email: string, password: string): Promise<Session>;
  login(email: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  createRoute(request: RouteRequest): Promise<Route>;
  refineRoute(id: string, action: RefineAction): Promise<Route>;
  undo(id: string): Promise<Route>;
  getRoute(id: string): Promise<Route>;
  listRoutes(): Promise<Route[]>;            // solo rutas guardadas de la cuenta, la más reciente primero
  saveRoute(id: string): Promise<Route>;
  deleteRoute(id: string): Promise<void>;
  rateRoute(id: string, rating: Rating): Promise<void>;
  getPlace(id: string): Promise<Place>;
  getAlternatives(routeId: string, order: number): Promise<Place[]>;
  setFavorite(id: string, favorite: boolean): Promise<Route>;                                     // Añadido en feature 2
  getRating(id: string): Promise<Rating | null>;                                                  // Añadido en feature 2
  updateAccount(patch: Partial<Pick<Session, "name" | "email" | "settings">>): Promise<Session>;  // Añadido en feature 2
  deleteAccount(): Promise<void>;                                                                 // Añadido en feature 2
  verifyEmail(token: string): Promise<{ email: string }>;                                         // Añadido en feature 4
  resendVerification(): Promise<void>;                                                            // Añadido en feature 4
  authProviders(): Promise<AuthProvider[]>;                                                       // Añadido en feature 4
  /** Starts the provider sign-in. With a backend it navigates away and never resolves; the demo resolves with the session. */
  signInWith(provider: AuthProvider): Promise<Session>;                                           // Añadido en feature 4
  /** Finishes the provider sign-in on /auth/callback from the URL fragment (state + ticket). */
  completeSignIn(fragment: string): Promise<Session>;                                             // Añadido en feature 4
}

// Responsable: spec 1 (guion del asistente simulado)
export interface Assistant {
  sendMessage(input: { text?: string; option?: string }): Promise<AssistantReply>;
}
