import { useState } from 'react'

export default function MoneyCalculator() {
  const [participants, setParticipants] = useState([])
  const [newPersonName, setNewPersonName] = useState('')
  
  const [totalBillExp, setTotalBillExp] = useState('')
  
  const [itemName, setItemName] = useState('')
  const [itemPriceExp, setItemPriceExp] = useState('')
  const [selectedConsumers, setSelectedConsumers] = useState([])
  const [itemList, setItemList] = useState([])
  
  const [view, setView] = useState('input') // 'input' | 'result'
  const [resultData, setResultData] = useState(null)
  const [finalTotal, setFinalTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  const addPerson = () => {
    const name = newPersonName.trim()
    if (!name || participants.includes(name)) return
    setParticipants([...participants, name])
    setNewPersonName('')
  }

  const toggleConsumer = (name) => {
    if (selectedConsumers.includes(name)) {
      setSelectedConsumers(selectedConsumers.filter(c => c !== name))
    } else {
      setSelectedConsumers([...selectedConsumers, name])
    }
  }

  const addItemToList = () => {
    if (!itemName || !itemPriceExp || selectedConsumers.length === 0) {
      alert("請填寫項目名稱、金額，並選擇至少一位參與者")
      return
    }
    try {
      // Evaluate math expression, replacing all non math characters
      const cleanExp = itemPriceExp.replace(/[^0-9+\-*/().]/g, "")
      const amount = eval(cleanExp)
      setItemList([...itemList, { name: itemName, amount, consumers: [...selectedConsumers] }])
      setItemName('')
      setItemPriceExp('')
      setSelectedConsumers([])
    } catch (e) {
      alert("金額算式錯誤")
    }
  }

  const deleteItem = (index) => {
    const newList = [...itemList]
    newList.splice(index, 1)
    setItemList(newList)
  }

  const calculateLocally = () => {
    if (participants.length === 0 || !totalBillExp) {
      alert("請新增至少一位參與者，並輸入整單總金額")
      return
    }

    try {
      setLoading(true)
      const cleanTotalExp = totalBillExp.replace(/[^0-9+\-*/().]/g, "")
      if (!cleanTotalExp) throw new Error()
      const finalTotalBill = eval(cleanTotalExp)

      let specificTotal = 0
      itemList.forEach(item => {
        specificTotal += item.amount
      })

      let sharedBill = finalTotalBill - specificTotal
      if (sharedBill < 0) sharedBill = 0

      const sharedPerPerson = participants.length ? (sharedBill / participants.length) : 0
      
      const totals = {}
      participants.forEach(p => {
        totals[p] = sharedPerPerson
      })

      itemList.forEach(item => {
        if (!item.consumers || item.consumers.length === 0) return
        const splitPrice = item.amount / item.consumers.length
        item.consumers.forEach(p => {
          if (totals[p] !== undefined) {
            totals[p] += splitPrice
          }
        })
      })

      setResultData({
        status: "success",
        shared_per_person: sharedPerPerson,
        final_totals: totals
      })
      setFinalTotal(finalTotalBill)
      setView('result')
      
    } catch (e) {
      alert("金額輸入錯誤或計算出錯")
    } finally {
      setLoading(false)
    }
  }

  const resetApp = () => {
    setParticipants([])
    setNewPersonName('')
    setTotalBillExp('')
    setItemName('')
    setItemPriceExp('')
    setSelectedConsumers([])
    setItemList([])
    setView('input')
    setResultData(null)
  }

  return (
    <div className="calculator-container" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', fontFamily: 'var(--font-body)' }}>
      <style>{`
        .calc-card {
          background: var(--surface, #111);
          border: 1px solid var(--border, #333);
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
        }
        .calc-title {
          font-family: var(--font-sans);
          font-size: 18px;
          font-weight: 700;
          color: var(--accent);
          margin-bottom: 16px;
        }
        .calc-label {
          display: block;
          font-size: 13px;
          color: var(--muted);
          margin-bottom: 8px;
          margin-top: 16px;
        }
        .calc-input {
          width: 100%;
          background: #0a0a0a;
          border: 1px solid #333;
          color: var(--fg);
          padding: 12px 16px;
          border-radius: 6px;
          font-family: var(--font-body);
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s;
        }
        .calc-input:focus {
          border-color: var(--accent);
        }
        .calc-btn-primary {
          background: var(--accent);
          color: #000;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-family: var(--font-sans);
          font-weight: 800;
          font-size: 14px;
          cursor: pointer;
          transition: opacity 0.2s, transform 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .calc-btn-primary:hover {
          opacity: 0.9;
          transform: translateY(-2px);
        }
        .calc-btn-secondary {
          background: rgba(255, 255, 255, 0.05);
          color: var(--fg);
          border: 1px solid #444;
          padding: 12px 24px;
          border-radius: 6px;
          font-family: var(--font-sans);
          font-weight: 600;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .calc-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .calc-chip {
          padding: 8px 16px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid #333;
          color: var(--muted);
          cursor: pointer;
          font-size: 13px;
          transition: 0.2s;
          display: inline-block;
        }
        .calc-chip.selected {
          background: var(--accent);
          color: #000;
          border-color: var(--accent);
          font-weight: 700;
        }
        .calc-chip.display-only {
          cursor: default;
          background: rgba(255, 255, 255, 0.03);
          color: var(--fg);
        }
        .calc-chip-container {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 12px;
        }
        .calc-list-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid #222;
          border-radius: 8px;
          margin-top: 12px;
        }
        .calc-summary {
          text-align: center;
          padding: 40px 20px;
          background: rgba(212, 240, 41, 0.05);
          border: 1px solid rgba(212, 240, 41, 0.2);
          border-radius: 12px;
          margin-bottom: 24px;
        }
        .calc-result-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 0;
          border-bottom: 1px solid #222;
        }
        .calc-result-row:last-child {
          border-bottom: none;
        }
      `}</style>

      {view === 'input' ? (
        <div style={{ animation: 'fadeIn 0.5s' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 32, fontWeight: 800, color: 'var(--fg)', marginBottom: 8 }}>聚餐結算</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>扣除個別花費，精準平分餘額</p>
          </div>

          <div className="calc-card">
            <div className="calc-title">1. 參與聚餐的朋友</div>
            <div style={{ display: 'flex', gap: 12 }}>
              <input 
                type="text" 
                className="calc-input" 
                value={newPersonName} 
                onChange={(e) => setNewPersonName(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && addPerson()}
                placeholder="輸入朋友名字" 
              />
              <button className="calc-btn-secondary" onClick={addPerson}>新增</button>
            </div>
            {participants.length > 0 && (
              <div className="calc-chip-container">
                {participants.map(p => (
                  <div key={p} className="calc-chip display-only">{p}</div>
                ))}
              </div>
            )}
          </div>

          <div className="calc-card">
            <div className="calc-title">2. 整單總金額</div>
            <input 
              type="text" 
              className="calc-input" 
              style={{ fontSize: 24, fontWeight: 700 }}
              value={totalBillExp}
              onChange={(e) => setTotalBillExp(e.target.value)}
              placeholder="$ 0 (可輸入算式，如 1000+200)" 
            />
          </div>

          <div className="calc-card">
            <div className="calc-title">3. 獨立計算項目 (選填)</div>
            
            <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label className="calc-label" style={{ marginTop: 0 }}>項目名稱</label>
                <input 
                  type="text" 
                  className="calc-input" 
                  value={itemName}
                  onChange={e => setItemName(e.target.value)}
                  placeholder="例如：生啤酒" 
                />
              </div>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label className="calc-label" style={{ marginTop: 0 }}>該項目金額</label>
                <input 
                  type="text" 
                  className="calc-input" 
                  value={itemPriceExp}
                  onChange={e => setItemPriceExp(e.target.value)}
                  placeholder="例如：120*3" 
                />
              </div>
            </div>
            
            {participants.length > 0 && (
              <>
                <label className="calc-label">誰參與了這項消費？</label>
                <div className="calc-chip-container">
                  {participants.map(p => (
                    <div 
                      key={p} 
                      className={`calc-chip ${selectedConsumers.includes(p) ? 'selected' : ''}`}
                      onClick={() => toggleConsumer(p)}
                    >
                      {p}
                    </div>
                  ))}
                </div>
              </>
            )}
            
            <button className="calc-btn-secondary" style={{ width: '100%', marginTop: 24 }} onClick={addItemToList}>
              ＋ 加入獨立項目
            </button>

            {itemList.length > 0 && (
              <div style={{ marginTop: 24 }}>
                {itemList.map((item, idx) => (
                  <div key={idx} className="calc-list-item">
                    <div>
                      <div style={{ color: 'var(--fg)', fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{item.name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>參與者：{item.consumers.join("、")}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>$ {item.amount}</span>
                      <button 
                        onClick={() => deleteItem(idx)}
                        style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16 }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button 
            className="calc-btn-primary" 
            style={{ width: '100%', padding: '16px', fontSize: 16 }} 
            onClick={calculateLocally}
            disabled={loading}
          >
            {loading ? '計算中...' : '送出結算'}
          </button>
        </div>
      ) : (
        <div style={{ animation: 'fadeIn 0.5s' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 32, fontWeight: 800, color: 'var(--fg)', marginBottom: 8 }}>結算完成</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>每人的最終應付金額</p>
          </div>

          <div className="calc-summary">
            <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 8 }}>本單總金額</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: 'var(--accent)', marginBottom: 16 }}>
              $ {finalTotal.toLocaleString()}
            </div>
            <div style={{ color: '#ccc', fontSize: 13 }}>
              (扣除特定項目後，每人共同平分: $ {resultData?.shared_per_person?.toFixed(0) || 0})
            </div>
          </div>

          <div className="calc-card">
            <div className="calc-title" style={{ marginBottom: 8 }}>個人應付明細</div>
            {resultData?.final_totals && Object.entries(resultData.final_totals).map(([name, amount]) => (
              <div key={name} className="calc-result-row">
                <span style={{ fontSize: 18, color: 'var(--fg)', fontWeight: 500 }}>{name}</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: 'var(--fg)' }}>$ {amount.toFixed(0)}</span>
              </div>
            ))}
          </div>

          <button 
            className="calc-btn-secondary" 
            style={{ width: '100%', padding: '16px', fontSize: 16 }} 
            onClick={resetApp}
          >
            開始新的聚餐計算
          </button>
        </div>
      )}
    </div>
  )
}
