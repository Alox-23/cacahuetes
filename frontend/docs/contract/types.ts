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
  travelToNext?: { mode: string; minutes: number };
  locked: boolean;
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

export type Session = { kind: "guest" | "account"; name?: string; email?: string };

export type RefineAction =
  | { type: "quick"; value: "menos_caminar" | "mas_comida" | "mas_barato" | "anadir_pausa" }
  | { type: "remove_stop" | "lock_stop"; order: number }
  | { type: "swap_stop"; order: number; placeId: string }
  | { type: "text"; value: string };

export type Place = {
  id: string; name: string; categories: string[];
  why?: string; hours?: string; price?: string; photo?: string;
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
  listRoutes(): Promise<Route[]>;
  saveRoute(id: string): Promise<Route>;
  deleteRoute(id: string): Promise<void>;
  rateRoute(id: string, rating: { stars: number; stops: Record<number, boolean>; comment?: string }): Promise<void>;
  getPlace(id: string): Promise<Place>;
  getAlternatives(routeId: string, order: number): Promise<Place[]>;
}

// Responsable: spec 1 (guion del asistente simulado)
export interface Assistant {
  sendMessage(input: { text?: string; option?: string }): Promise<AssistantReply>;
}
