import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Calculator, BarChart2, Info, ArrowRight } from 'lucide-react';
import { GuardrailAuditResult } from '../lib/guardrails';

interface GuardrailVerificationPanelProps {
  auditResult: GuardrailAuditResult | null;
  onReaudit?: () => void;
  className?: string;
}

export const GuardrailVerificationPanel: React.FC<GuardrailVerificationPanelProps> = ({
  auditResult,
  onReaudit,
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'shares' | 'formulas' | 'logs'>('shares');

  if (!auditResult) {
    return null;
  }

  const {
    passed,
    score,
    totalShareSum,
    sharesNormalized,
    channelShares,
    metricChecks,
    summaryText,
    checksums,
    timestamp,
    correctionsLog
  } = auditResult;

  return (
    <div className={`bg-white rounded-2xl border ${passed ? 'border-emerald-200' : 'border-amber-200'} executive-shadow overflow-hidden transition-all ${className}`}>
      {/* Header Banner */}
      <div 
        className={`px-5 py-3.5 flex items-center justify-between cursor-pointer select-none transition-colors ${
          passed 
            ? 'bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/40 hover:bg-emerald-50' 
            : 'bg-gradient-to-r from-amber-50/80 via-white to-amber-50/40 hover:bg-amber-50'
        }`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`p-2 rounded-xl text-white shrink-0 ${
            passed ? 'bg-emerald-600 shadow-sm' : 'bg-amber-600 shadow-sm'
          }`}>
            {passed ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-black uppercase tracking-wider text-monks-dark font-sans flex items-center gap-1.5">
                Guardrail Numérico Santander
              </span>
              
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase font-mono tracking-wider ${
                passed 
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}>
                Score: {score}/100
              </span>

              {sharesNormalized && (
                <span className="bg-santander-cielo text-santander-red px-2 py-0.5 rounded-full text-[9px] font-bold border border-santander-red/20 font-mono">
                  100% Normalizado
                </span>
              )}
            </div>

            <p className="text-xs text-gray-700 font-medium truncate mt-0.5">
              {summaryText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4 shrink-0">
          <span className="text-[10px] text-gray-400 font-mono hidden md:inline">
            Auditado: {timestamp}
          </span>
          <div className="p-1 rounded-lg text-gray-500 hover:bg-gray-200 transition-colors">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Expanded Audit Details */}
      {isOpen && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-5 space-y-5">
          {/* Top Quick Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Suma Participación Canales</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className={`text-base font-black font-mono ${
                    Math.abs(totalShareSum - 100) <= 0.15 ? 'text-emerald-700' : 'text-amber-700'
                  }`}>
                    {totalShareSum}%
                  </span>
                  {sharesNormalized && (
                    <span className="text-[10px] font-bold text-emerald-600 font-mono">→ 100.0%</span>
                  )}
                </div>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg text-gray-500">
                <Calculator className="w-4 h-4 text-santander-red" />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Coincidencia de Fórmulas</span>
                <span className="text-base font-black font-mono text-emerald-700 mt-0.5 block">
                  {metricChecks.filter(m => m.status === 'PASSED').length} / {metricChecks.length || 1} OK
                </span>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg text-gray-500">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-gray-200/80 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Integridad de Matriz (Checksum)</span>
                <span className="text-base font-black font-mono text-monks-dark mt-0.5 block">
                  {checksums.integrityRatio}% Validado
                </span>
              </div>
              <div className="p-2 bg-gray-50 rounded-lg text-gray-500">
                <BarChart2 className="w-4 h-4 text-blue-600" />
              </div>
            </div>
          </div>

          {/* Sub-tabs navigation */}
          <div className="flex border-b border-gray-200 text-xs font-bold gap-2">
            <button
              onClick={() => setActiveTab('shares')}
              className={`pb-2 px-3 border-b-2 transition-all cursor-pointer ${
                activeTab === 'shares'
                  ? 'border-santander-red text-santander-red font-black'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Participación por Canal (Target 100%)
            </button>

            <button
              onClick={() => setActiveTab('formulas')}
              className={`pb-2 px-3 border-b-2 transition-all cursor-pointer ${
                activeTab === 'formulas'
                  ? 'border-santander-red text-santander-red font-black'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Fórmulas y Ratios ({metricChecks.length})
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`pb-2 px-3 border-b-2 transition-all cursor-pointer ${
                activeTab === 'logs'
                  ? 'border-santander-red text-santander-red font-black'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              Trazabilidad ({correctionsLog.length})
            </button>
          </div>

          {/* TAB 1: Shares Breakdown */}
          {activeTab === 'shares' && (
            <div className="space-y-3">
              {channelShares.length === 0 ? (
                <div className="p-4 bg-white rounded-xl border border-gray-200 text-center text-xs text-gray-500 italic">
                  No se detectaron columnas explícitas de participaciones (%) en el input. Escaneando la matriz completa.
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden text-xs">
                  <div className="bg-gray-100/70 px-4 py-2 flex justify-between font-bold text-gray-600 uppercase text-[10px] tracking-wider border-b border-gray-200">
                    <span>Canal de Medios / Pauta</span>
                    <span>Share Original vs Normalizado (100%)</span>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {channelShares.map((item, idx) => (
                      <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-santander-red"></span>
                          <span className="font-bold text-monks-dark capitalize">{item.channel}</span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right font-mono">
                            <span className="text-gray-500 font-bold">{item.originalShare}%</span>
                            {item.diff !== 0 && (
                              <span className="text-emerald-700 font-bold ml-2 flex items-center gap-1 inline-flex">
                                <ArrowRight className="w-3 h-3" />
                                {item.adjustedShare}%
                              </span>
                            )}
                          </div>

                          <div className="w-24 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div 
                              className="bg-santander-red h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.min(100, item.adjustedShare)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs font-bold text-monks-dark font-mono">
                    <span>TOTAL CANALES:</span>
                    <span className={Math.abs(totalShareSum - 100) <= 0.15 ? "text-emerald-700" : "text-amber-700"}>
                      {totalShareSum}% {sharesNormalized ? "→ NORMALIZADO A 100.0%" : ""}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Formulas & Ratios */}
          {activeTab === 'formulas' && (
            <div className="space-y-2.5">
              {metricChecks.map((check, idx) => (
                <div key={idx} className="bg-white p-3.5 rounded-xl border border-gray-200/80 flex items-start justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-monks-dark">{check.metricName}</span>
                      <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {check.formula}
                      </span>
                    </div>
                    <p className="text-gray-600 text-[11px] leading-relaxed">{check.details}</p>
                  </div>

                  <span className={`px-2 py-1 rounded text-[10px] font-black uppercase font-mono shrink-0 ${
                    check.status === 'PASSED' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {check.status === 'PASSED' ? '✓ Validado' : '⚠️ Ajustado'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: Traceability Log */}
          {activeTab === 'logs' && (
            <div className="bg-monks-dark text-gray-200 p-4 rounded-xl font-mono text-[11px] space-y-1.5 max-h-48 overflow-y-auto">
              {correctionsLog.length === 0 ? (
                <p className="text-gray-400 italic">No se requirieron correcciones. Matriz matemáticamente perfecta.</p>
              ) : (
                correctionsLog.map((log, idx) => (
                  <p key={idx} className="text-emerald-400 leading-relaxed">
                    [Guardrail Engine] {log}
                  </p>
                ))
              )}
            </div>
          )}

          {/* Re-audit Action Button */}
          {onReaudit && (
            <div className="flex justify-end pt-1">
              <button
                onClick={onReaudit}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-gray-200 shadow-xs"
              >
                <RefreshCw className="w-3.5 h-3.5 text-santander-red" />
                <span>Ejecutar Re-Auditoría de Tabla</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
