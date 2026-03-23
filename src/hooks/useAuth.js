/**
 * useAuth.js — Authentication hook via Supabase Auth.
 * Provides: user, loading, signIn, signUp, signOut
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';

export function useAuth() {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => setUser(session?.user ?? null)
    );
    return () => subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email, password, fullName) => {
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const exportData = useCallback(async () => {
    const { data, error } = await supabase.rpc('export_user_data', {
      p_user_id: user?.id,
    });
    if (error) throw error;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `fit-analyzer-export-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [user]);

  const deleteAccount = useCallback(async () => {
    // Delete all user data (RLS cascade handles DB)
    // FIT files in storage
    const { data: files } = await supabase.storage
      .from('fit-files')
      .list(user?.id);
    if (files?.length) {
      await supabase.storage.from('fit-files').remove(
        files.map(f => `${user.id}/${f.name}`)
      );
    }
    // Delete auth user (triggers cascade)
    await supabase.rpc('delete_user');
    await supabase.auth.signOut();
  }, [user]);

  return { user, loading, signUp, signIn, signOut, exportData, deleteAccount };
}
