// Shared types across all Pjak apps

export type ObjectType = '3d_model' | 'text' | 'code_object';

// A placed object in the world (permanent, set by developer)
export type PjakObject = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type: ObjectType;
  code: string;
  display_text: string | null;  // text shown on/near object
  model_ref: string | null;     // 3D model reference (filename, URL, etc.)
  metadata: Record<string, any>;
  created_at: string;
};

// A registered device (phone) pushing GPS
export type Device = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  updated_at: string;
};
