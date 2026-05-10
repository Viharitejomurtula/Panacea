import { useState } from 'react';
import DeckGL from '@deck.gl/react';
import { MapView } from '@deck.gl/core';
import { ScatterplotLayer } from '@deck.gl/layers';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { INITIAL_VIEW, WORLD, MAP_BOUNDS } from '../simulation/constant';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json';

const MIN_ZOOM = 11;
const MAX_ZOOM = 15;
// How far the user can pan beyond the simulation boundary
const LON_SLACK = (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin) * 0.12;
const LAT_SLACK = (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin) * 0.12;

function toLngLat(x, y) {
  return [
    MAP_BOUNDS.lonMin + (x / WORLD.W) * (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin),
    // flip y: screen y=0 is top (north), latitude increases northward
    MAP_BOUNDS.latMax - (y / WORLD.H) * (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin),
  ];
}

export default function SimCanvas({ agents, diseaseColor }) {
  const [viewState, setViewState] = useState(INITIAL_VIEW);

  function onViewStateChange({ viewState: vs }) {
    setViewState({
      ...vs,
      longitude: Math.max(MAP_BOUNDS.lonMin - LON_SLACK, Math.min(MAP_BOUNDS.lonMax + LON_SLACK, vs.longitude)),
      latitude:  Math.max(MAP_BOUNDS.latMin - LAT_SLACK, Math.min(MAP_BOUNDS.latMax + LAT_SLACK, vs.latitude)),
      zoom:      Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vs.zoom)),
    });
  }

  const infectionRingLayer = new ScatterplotLayer({
    id: 'infection-rings',
    data: agents.filter((a) => a.state === 'I'),
    getPosition: (d) => toLngLat(d.x, d.y),
    getRadius: 18,
    getFillColor: [249, 115, 22, 30],
    radiusUnits: 'pixels',
    stroked: false,
    pickable: false,
  });

  const agentLayer = new ScatterplotLayer({
    id: 'agents',
    data: agents,
    getPosition: (d) => toLngLat(d.x, d.y),
    getRadius: (d) => {
      if (d.state === 'I') return 7;
      if (d.state === 'D') return 4;
      return 5;
    },
    getFillColor: (d) => {
      if (d.state === 'S') return [147, 197, 253, 200];
      if (d.state === 'I') return diseaseColor;
      if (d.state === 'R') return [74, 222, 128, 180];
      if (d.state === 'D') return [120, 0, 0, 230];
      return [50, 60, 80, 160];
    },
    radiusUnits: 'pixels',
    radiusMinPixels: 3,
    stroked: false,
    pickable: false,
    updateTriggers: {
      getFillColor: agents,
      getRadius: agents,
    },
  });

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <DeckGL
        views={new MapView()}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        controller={{ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM }}
        layers={[infectionRingLayer, agentLayer]}
      >
        <Map mapStyle={MAP_STYLE} />
      </DeckGL>
    </div>
  );
}
