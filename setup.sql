-- =============================================
-- LISTERFY — Setup completo de base de datos
-- Ejecutar en Supabase SQL Editor (en orden)
-- =============================================


-- ── 1. EXTENSIONES ───────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ── 2. TABLAS ─────────────────────────────────

-- Perfiles de usuario (se crea automático con auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT,
  email         TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Categorías de ítems
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_es     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  icon        TEXT NOT NULL,
  is_default  BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Listas de compras
CREATE TABLE IF NOT EXISTS public.lists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Miembros de cada lista
CREATE TABLE IF NOT EXISTS public.list_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id     UUID REFERENCES public.lists(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT DEFAULT 'member',
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(list_id, user_id)
);

-- Ítems de cada lista
CREATE TABLE IF NOT EXISTS public.items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id      UUID REFERENCES public.lists(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  quantity     TEXT,
  category_id  UUID REFERENCES public.categories(id),
  added_by     UUID REFERENCES auth.users(id),
  is_checked   BOOLEAN DEFAULT FALSE,
  checked_by   UUID REFERENCES auth.users(id),
  checked_at   TIMESTAMPTZ,
  item_state   TEXT DEFAULT 'unchecked' CHECK (item_state IN ('unchecked','checked','completed')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Invitaciones a listas
CREATE TABLE IF NOT EXISTS public.invitations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id        UUID REFERENCES public.lists(id) ON DELETE CASCADE,
  invited_by     UUID REFERENCES auth.users(id),
  invited_email  TEXT NOT NULL,
  status         TEXT DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Notificaciones
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  data       JSONB,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ── 3. REPLICA IDENTITY (para Realtime) ───────
ALTER TABLE public.items        REPLICA IDENTITY FULL;
ALTER TABLE public.list_members REPLICA IDENTITY FULL;


-- ── 4. REALTIME ───────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.list_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- ── 5. TRIGGER: crear perfil al registrarse ───
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'display_name',
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── 6. TRIGGER: agregar dueño como miembro ────
CREATE OR REPLACE FUNCTION public.add_owner_as_member()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.list_members (list_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_list_created ON public.lists;
CREATE TRIGGER on_list_created
  AFTER INSERT ON public.lists
  FOR EACH ROW EXECUTE FUNCTION public.add_owner_as_member();


-- ── 7. TRIGGER: aceptar invitación ────────────
CREATE OR REPLACE FUNCTION public.handle_invitation_accepted()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_list_name TEXT;
  v_inviter_name TEXT;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    -- Buscar el user_id por email
    SELECT id INTO v_user_id FROM auth.users WHERE email = NEW.invited_email LIMIT 1;
    IF v_user_id IS NOT NULL THEN
      -- Agregar como miembro
      INSERT INTO public.list_members (list_id, user_id, role)
      VALUES (NEW.list_id, v_user_id, 'member')
      ON CONFLICT DO NOTHING;
      -- Notificar al invitante
      SELECT l.name INTO v_list_name FROM public.lists l WHERE l.id = NEW.list_id;
      SELECT p.display_name INTO v_inviter_name FROM public.profiles p WHERE p.id = NEW.invited_by;
      INSERT INTO public.notifications (user_id, type, data)
      VALUES (
        NEW.invited_by,
        'invite_accepted',
        jsonb_build_object(
          'list_id', NEW.list_id,
          'list_name', v_list_name,
          'accepted_by', NEW.invited_email
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_invitation_accepted ON public.invitations;
CREATE TRIGGER on_invitation_accepted
  AFTER UPDATE ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_invitation_accepted();


-- ── 8. TRIGGER: crear notificación al invitar ─
CREATE OR REPLACE FUNCTION public.handle_new_invitation()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id   UUID;
  v_list_name TEXT;
  v_inviter   TEXT;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = NEW.invited_email LIMIT 1;
  SELECT name INTO v_list_name FROM public.lists WHERE id = NEW.list_id;
  SELECT display_name INTO v_inviter FROM public.profiles WHERE id = NEW.invited_by;
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, data)
    VALUES (
      v_user_id,
      'invite_received',
      jsonb_build_object(
        'invitation_id', NEW.id,
        'list_id',       NEW.list_id,
        'list_name',     v_list_name,
        'invited_by',    v_inviter
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_invitation_created ON public.invitations;
CREATE TRIGGER on_invitation_created
  AFTER INSERT ON public.invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_invitation();


-- ── 9. FUNCIÓN RLS: listas del usuario ────────
CREATE OR REPLACE FUNCTION public.get_my_list_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT list_id FROM public.list_members WHERE user_id = auth.uid();
$$;


-- ── 10. ROW LEVEL SECURITY ────────────────────

-- profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver perfil propio" ON public.profiles;
DROP POLICY IF EXISTS "Editar perfil propio" ON public.profiles;
CREATE POLICY "Ver perfil propio"   ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "Editar perfil propio" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- lists
ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver listas" ON public.lists;
DROP POLICY IF EXISTS "Crear listas" ON public.lists;
DROP POLICY IF EXISTS "Editar lista" ON public.lists;
DROP POLICY IF EXISTS "Borrar lista" ON public.lists;
CREATE POLICY "Ver listas"    ON public.lists FOR SELECT USING (id IN (SELECT public.get_my_list_ids()));
CREATE POLICY "Crear listas"  ON public.lists FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Editar lista"  ON public.lists FOR UPDATE USING (owner_id = auth.uid());
CREATE POLICY "Borrar lista"  ON public.lists FOR DELETE USING (owner_id = auth.uid());

-- list_members
ALTER TABLE public.list_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver miembros" ON public.list_members;
DROP POLICY IF EXISTS "Agregar miembro" ON public.list_members;
DROP POLICY IF EXISTS "Borrar miembro" ON public.list_members;
CREATE POLICY "Ver miembros"    ON public.list_members FOR SELECT USING (list_id IN (SELECT public.get_my_list_ids()));
CREATE POLICY "Agregar miembro" ON public.list_members FOR INSERT WITH CHECK (list_id IN (SELECT public.get_my_list_ids()));
CREATE POLICY "Borrar miembro"  ON public.list_members FOR DELETE USING (user_id = auth.uid());

-- items
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver items" ON public.items;
DROP POLICY IF EXISTS "Agregar items" ON public.items;
DROP POLICY IF EXISTS "Editar items" ON public.items;
DROP POLICY IF EXISTS "Borrar items" ON public.items;
CREATE POLICY "Ver items"     ON public.items FOR SELECT USING (list_id IN (SELECT public.get_my_list_ids()));
CREATE POLICY "Agregar items" ON public.items FOR INSERT WITH CHECK (list_id IN (SELECT public.get_my_list_ids()));
CREATE POLICY "Editar items"  ON public.items FOR UPDATE USING (list_id IN (SELECT public.get_my_list_ids()));
CREATE POLICY "Borrar items"  ON public.items FOR DELETE USING (list_id IN (SELECT public.get_my_list_ids()));

-- invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver invitaciones" ON public.invitations;
DROP POLICY IF EXISTS "Crear invitacion" ON public.invitations;
DROP POLICY IF EXISTS "Responder invitacion" ON public.invitations;
CREATE POLICY "Ver invitaciones"    ON public.invitations FOR SELECT USING (invited_by = auth.uid() OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()));
CREATE POLICY "Crear invitacion"    ON public.invitations FOR INSERT WITH CHECK (invited_by = auth.uid());
CREATE POLICY "Responder invitacion" ON public.invitations FOR UPDATE USING (invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Ver notificaciones" ON public.notifications;
DROP POLICY IF EXISTS "Marcar leida" ON public.notifications;
CREATE POLICY "Ver notificaciones" ON public.notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Marcar leida"       ON public.notifications FOR UPDATE USING (user_id = auth.uid());


-- ── 11. CATEGORÍAS POR DEFECTO ────────────────
INSERT INTO public.categories (name_es, name_en, icon) VALUES
  ('Frutas y Verduras', 'Fruits & Vegetables', '🥦'),
  ('Carnes y Pescados', 'Meat & Fish',          '🥩'),
  ('Lácteos y Huevos', 'Dairy & Eggs',          '🥛'),
  ('Panadería',        'Bakery',                '🍞'),
  ('Bebidas',          'Beverages',             '🧃'),
  ('Snacks',           'Snacks',                '🍿'),
  ('Limpieza',         'Cleaning',              '🧹'),
  ('Higiene',          'Hygiene',               '🧴'),
  ('Congelados',       'Frozen',                '🧊'),
  ('Otros',            'Other',                 '🛒')
ON CONFLICT DO NOTHING;


-- ── 12. AUTH: URL de tu sitio ─────────────────
-- Recuerda configurar en Supabase Dashboard:
-- Authentication → URL Configuration:
--   Site URL:      https://TU-USUARIO.github.io/listerfy/
--   Redirect URLs: https://TU-USUARIO.github.io/**

-- =============================================
-- FIN DEL SETUP — Listerfy está listo 🎉
-- =============================================
