import { haversineDistanceKm } from '../../utils/distance.js';
import { formatKm, humanizeType } from '../../utils/formatters.js';
import styles from './PlacesTable.module.css';

function PlacesTable({ places, center }) {
  if (places.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Nenhum estabelecimento foi encontrado para esta análise.</p>
      </div>
    );
  }

  const rows = places
    .map((place) => ({ ...place, distanceKm: haversineDistanceKm(center, place.location) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">Endereço</th>
            <th scope="col">Distância</th>
            <th scope="col">Tipo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((place) => (
            <tr key={place.placeId}>
              <td>{place.name}</td>
              <td>{place.address}</td>
              <td>{formatKm(place.distanceKm)}</td>
              <td>{humanizeType(place.primaryType)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PlacesTable;
