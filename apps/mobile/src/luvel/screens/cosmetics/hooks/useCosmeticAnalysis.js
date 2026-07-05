import { useCallback, useEffect, useState } from 'react';
import { cosmeticsAPI } from '../../../../api/cosmetics';
import { getRiskIngredients } from '../cosmeticAnalysisDisplay';

export function useCosmeticAnalysis(cosmeticId, enabled = true) {
  const [analysis, setAnalysis] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => setRetryKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled || !cosmeticId) {
      setAnalysis(null);
      setDetail(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [analysisData, detailData] = await Promise.all([
          cosmeticsAPI.getCosmeticAnalysis(cosmeticId),
          cosmeticsAPI.getCosmeticDetail(cosmeticId),
        ]);
        if (!cancelled) {
          setAnalysis(analysisData);
          setDetail(detailData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.detail || '분석 데이터를 불러올 수 없습니다.');
          setAnalysis(null);
          setDetail(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cosmeticId, enabled, retryKey]);

  const riskIngredients = getRiskIngredients(analysis, detail);
  const ingredientCount = detail?.ingredients_list?.length || 0;

  return {
    analysis,
    detail,
    loading,
    error,
    retry,
    riskIngredients,
    ingredientCount,
    product: analysis?.product || detail || null,
  };
}
