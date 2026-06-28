export type TagGroup = "scene" | "type" | "feature";

export type Tag = {
  id: number;
  name: string;
  group: TagGroup;
  created_at: string;
};

export type TagCreate = {
  name: string;
  group: TagGroup;
};

export type TagUpdate = {
  name?: string | null;
  group?: TagGroup | null;
};
