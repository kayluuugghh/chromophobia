const clientId = import.meta.env.VITE_CLIENT_ID;
const clientSecret = import.meta.env.VITE_CLIENT_SECRET;
const redirectURI = import.meta.env.VITE_REDIRECT_URI;
const AUTHORIZE = "https://accounts.spotify.com/authorize";

export function requestAuthorization() {
    let url = AUTHORIZE;
    url += "?client_id=" + clientId;
    url += "&response_type=code";
    url += "&redirect_uri=" + encodeURIComponent(redirectURI);
    url += "&show_dialogue=true";
    url += "&scope=user-read-private user-read-email user-read-playback-state user-modify-playback-state user-read-currently-playing app-remote-control streaming"
    window.location.href = url;
}