-- En básquet known_as es el nombre del box score («VILDOZA, J.») y full_name el de la ficha, que es el
-- que muestra el resto de la web (Jugadores): las vistas de modelos usan el mismo.
create or replace view api.market_value_prediction with (security_invoker = true) as
select m.team_slug, m.player_id, coalesce(p.full_name, p.known_as) as player_name, p.position_raw as position_group,
       m.actual_eur, m.predicted_eur, m.low_eur, m.high_eur, m.residual_pct, m.features, m.detail
from core.market_value_prediction m join core.player p using (player_id);

create or replace view api.player_style with (security_invoker = true) as
select st.team_slug, st.player_id, coalesce(p.full_name, p.known_as) as player_name, p.position_raw as position_group,
       st.cluster, st.cluster_label, st.pc1, st.pc2, st.features, st.z, st.percentiles
from core.player_style st join core.player p using (player_id);
