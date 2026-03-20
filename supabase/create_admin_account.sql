-- ==========================================
-- CREATE ADMIN ACCOUNT SQL
-- Run this in your Supabase SQL Editor.
-- ==========================================

DO $$ 
DECLARE 
  -- Credentials from user request
  new_email TEXT := 'dataghana@gmail.com';
  new_pass  TEXT := 'D4G_Adm!n#2026x';
  new_phone TEXT := '0559623850';
  new_id    UUID := gen_random_uuid();
BEGIN
  -- 1. Check if user already exists
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = new_email) THEN
    RAISE NOTICE 'User % already exists. Skipping auth insertion.', new_email;
    SELECT id INTO new_id FROM auth.users WHERE email = new_email;
  ELSE
    -- 2. Insert into auth.users
    INSERT INTO auth.users (
      id, 
      instance_id, 
      email, 
      encrypted_password, 
      email_confirmed_at, 
      raw_app_meta_data, 
      raw_user_meta_data, 
      created_at, 
      updated_at, 
      role, 
      confirmation_token, 
      email_change, 
      email_change_token_new, 
      recovery_token
    )
    VALUES (
      new_id,
      '00000000-0000-0000-0000-000000000000',
      new_email,
      extensions.crypt(new_pass, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      format('{"first_name":"Admin","last_name":"D4G","phone":"%s"}', new_phone)::jsonb,
      now(),
      now(),
      'authenticated',
      '',
      '',
      '',
      ''
    );

    -- 3. Insert into auth.identities
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      new_id,
      new_id,
      format('{"sub":"%s","email":"%s"}', new_id, new_email)::jsonb,
      'email',
      now(),
      now(),
      now()
    );
    
    RAISE NOTICE 'New auth user created with ID: %', new_id;
  END IF;

  -- 4. Ensure public.users entry exists and has 'admin' role
  -- The trigger 'on_auth_user_created' might have fired, but we ensure it here.
  INSERT INTO public.users (id, email, phone, first_name, last_name, role)
  VALUES (
    new_id,
    new_email,
    new_phone,
    'Admin',
    'D4G',
    'admin'
  )
  ON CONFLICT (id) DO UPDATE 
  SET role = 'admin',
      phone = EXCLUDED.phone;

  RAISE NOTICE 'Admin role verified for user: %', new_email;

END $$;
