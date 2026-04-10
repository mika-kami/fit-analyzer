import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { normalizeGearItem } from '../core/gearModel.js';

function toRow(item, userId) {
  return {
    user_id: userId,
    name: item.name,
    type: item.type,
    sport: item.sport,
    brand: item.brand ?? '',
    bike_name: item.bike_name ?? '',
    parent_gear_id: item.parent_gear_id ?? null,
    notes: item.notes ?? '',
    default_for_new: !!item.default_for_new,
    max_distance_m: item.max_distance_m ?? null,
    service_interval_m: item.service_interval_m ?? null,
    is_retired: !!item.is_retired,
  };
}

function sameDefaultScope(a, b) {
  return (
    a?.type === b?.type &&
    a?.sport === b?.sport &&
    String(a?.bike_name ?? '').trim().toLowerCase() === String(b?.bike_name ?? '').trim().toLowerCase() &&
    (a?.parent_gear_id ?? null) === (b?.parent_gear_id ?? null)
  );
}

function defaultBikeComponents(bikeItem) {
  const bikeName = bikeItem?.name ?? bikeItem?.bike_name ?? '';
  const parentId = bikeItem?.id ?? null;
  return [
    { name: `${bikeName} Tyre Set`, type: 'tires', sport: 'cycling', bike_name: bikeName, parent_gear_id: parentId, default_for_new: true },
    { name: `${bikeName} Chain`, type: 'chain', sport: 'cycling', bike_name: bikeName, parent_gear_id: parentId, default_for_new: true },
    { name: `${bikeName} Cassette`, type: 'cassette', sport: 'cycling', bike_name: bikeName, parent_gear_id: parentId, default_for_new: true },
    { name: `${bikeName} Crankset`, type: 'crankset', sport: 'cycling', bike_name: bikeName, parent_gear_id: parentId, default_for_new: true },
    { name: `${bikeName} Brakes`, type: 'brakes', sport: 'cycling', bike_name: bikeName, parent_gear_id: parentId, default_for_new: true },
  ];
}

export function useGear(user) {
  const userId = user?.id ?? null;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: dbErr } = await supabase
      .from('gear_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (dbErr) {
      setError(dbErr.message);
      setItems([]);
      setLoading(false);
      return;
    }

    setItems((data ?? []).map(normalizeGearItem));
    setError(null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const applyDefaultExclusivity = useCallback(async (currentItem) => {
    if (!userId || !currentItem?.default_for_new || currentItem?.is_retired) return;

    const siblingIds = items
      .filter((item) => item.id !== currentItem.id && !item.is_retired && item.default_for_new && sameDefaultScope(item, currentItem))
      .map((item) => item.id);

    if (!siblingIds.length) return;

    const { error: dbErr } = await supabase
      .from('gear_items')
      .update({ default_for_new: false })
      .in('id', siblingIds)
      .eq('user_id', userId);

    if (dbErr) {
      setError(dbErr.message);
      return;
    }

    setItems((prev) => prev.map((item) => (
      siblingIds.includes(item.id) ? { ...item, default_for_new: false } : item
    )));
  }, [items, userId]);

  const addGear = useCallback(async (input) => {
    if (!userId) return null;
    const normalized = normalizeGearItem({
      ...input,
      id: undefined,
      is_retired: false,
      added_at: new Date().toISOString(),
      total_distance_m: 0,
      total_sessions: 0,
    });
    const { data, error: dbErr } = await supabase
      .from('gear_items')
      .insert(toRow(normalized, userId))
      .select('*')
      .single();

    if (dbErr) {
      setError(dbErr.message);
      return null;
    }

    const saved = normalizeGearItem(data);
    let addedItems = [saved];

    if (saved.type === 'bike' && input?.auto_create_defaults !== false) {
      const componentRows = defaultBikeComponents(saved).map((item) => {
        const normalized = normalizeGearItem({
          ...item,
          id: undefined,
          is_retired: false,
          added_at: new Date().toISOString(),
          total_distance_m: 0,
          total_sessions: 0,
        });
        return toRow(normalized, userId);
      });

      const { data: componentData, error: componentsErr } = await supabase
        .from('gear_items')
        .insert(componentRows)
        .select('*');

      if (componentsErr) {
        setError(componentsErr.message);
      } else {
        addedItems = [saved, ...(componentData ?? []).map(normalizeGearItem)];
      }
    }

    setItems((prev) => [...addedItems, ...prev]);
    setError(null);
    for (const item of addedItems) {
      await applyDefaultExclusivity(item);
    }
    return saved;
  }, [applyDefaultExclusivity, userId]);

  const updateGear = useCallback(async (id, patch) => {
    if (!userId) return null;
    const current = items.find((item) => item.id === id);
    if (!current) return null;

    const next = normalizeGearItem({
      ...current,
      ...patch,
      default_for_new: patch?.is_retired ? false : (patch?.default_for_new ?? current.default_for_new),
    });

    const { data, error: dbErr } = await supabase
      .from('gear_items')
      .update(toRow(next, userId))
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (dbErr) {
      setError(dbErr.message);
      return null;
    }

    const saved = normalizeGearItem(data);
    setItems((prev) => prev.map((item) => (item.id === id ? saved : item)));
    setError(null);
    await applyDefaultExclusivity(saved);
    return saved;
  }, [applyDefaultExclusivity, items, userId]);

  const retireGear = useCallback(async (id) => {
    return updateGear(id, { is_retired: true, default_for_new: false });
  }, [updateGear]);

  return {
    items,
    loading,
    error,
    reload: load,
    addGear,
    updateGear,
    retireGear,
  };
}
