import React, { useMemo, useState } from 'react';

export default function Templates({ templates, selectedTemplateId, onSelect, onContinue }) {
  const [gender, setGender] = useState('male');

  const filtered = useMemo(() => templates.filter((t) => t.gender === gender), [templates, gender]);

  return (
    <div>
      <div className="grow-center" style={{ flex: 'none', marginBottom: 8 }}>
        <h1 className="title" style={{ fontSize: 24 }}>Choose Your Experience</h1>
        <p className="subtitle">Pick a template - your face becomes the star of a cinematic AI video.</p>
      </div>

      <div className="gender-tabs">
        <button className={`gender-tab male ${gender === 'male' ? 'active' : ''}`} onClick={() => setGender('male')}>
          MALE
        </button>
        <button className={`gender-tab female ${gender === 'female' ? 'active' : ''}`} onClick={() => setGender('female')}>
          FEMALE
        </button>
      </div>

      <div className="template-grid">
        {filtered.map((t) => (
          <button key={t.id} className={`template-card ${selectedTemplateId === t.id ? 'selected' : ''}`} onClick={() => onSelect(t.id)}>
            {selectedTemplateId === t.id && <div className="check">✓</div>}
            <img src={t.thumbnail} alt={t.name} loading="lazy" />
            <div className="info">
              <p className="name">{t.name}</p>
              <p className="desc">{t.description}</p>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="subtitle">Loading templates...</p>}
      </div>

      <div className="sticky-footer">
        <button className="btn btn-primary" disabled={!selectedTemplateId} onClick={onContinue}>
          CONTINUE
        </button>
      </div>
    </div>
  );
}
