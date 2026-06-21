<?php
/**
 * Plugin Name: AAAStreamer Connector
 * Description: Connects a WordPress site to an AAAStreamer account, provides an accessible stream player, and keeps listener comments inside WordPress moderation.
 * Version: 0.1.1
 * Author: Devine Creations
 * License: GPL-2.0-or-later
 * Text Domain: aaastreamer-connector
 */

if (!defined('ABSPATH')) {
    exit;
}

final class AAAStreamer_Connector {
    private const OPTION = 'aaastreamer_connector_settings';
    private const NONCE_ACTION = 'aaastreamer_connector_save';
    private const REST_NAMESPACE = 'aaastreamer/v1';

    public static function boot(): void {
        add_action('admin_menu', [__CLASS__, 'admin_menu']);
        add_action('admin_init', [__CLASS__, 'register_settings']);
        add_action('wp_enqueue_scripts', [__CLASS__, 'enqueue_frontend']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue_admin']);
        add_action('rest_api_init', [__CLASS__, 'register_rest_routes']);
        add_action('updated_option_' . self::OPTION, [__CLASS__, 'settings_updated'], 10, 3);
        add_filter('comments_open', [__CLASS__, 'comments_open_for_stream_page'], 9999, 2);
        add_shortcode('aaastreamer_player', [__CLASS__, 'render_player_shortcode']);
        add_shortcode('aaastreamer_account_panel', [__CLASS__, 'render_account_panel_shortcode']);
        add_shortcode('aaastreamer_comments', [__CLASS__, 'render_comments_shortcode']);
        register_activation_hook(__FILE__, [__CLASS__, 'activate']);
    }

    public static function defaults(): array {
        return [
            'enabled' => '1',
            'api_base' => 'https://aaastreamer.devinecreations.net',
            'stream_slug' => 'soulfoodradio-media',
            'stream_title' => 'SoulFoodRadio',
            'stream_description' => 'Listen to SoulFoodRadio and join the conversation below.',
            'pls_url' => 'https://soulfoodradio.media/listen.pls',
            'direct_stream_url' => '',
            'public_page_url' => 'https://aaastreamer.devinecreations.net/s/soulfoodradio-media',
            'wordpress_page_url' => '',
            'account_dashboard_url' => 'https://aaastreamer.devinecreations.net/dashboard',
            'wordpress_sso_enabled' => '1',
            'account_enabled' => '1',
            'comments_enabled' => '1',
            'hide_comments_on_stream_page' => '0',
            'api_token' => '',
            'iframe_admin' => '0',
        ];
    }

    public static function settings(): array {
        $saved = get_option(self::OPTION, []);
        if (!is_array($saved)) {
            $saved = [];
        }
        return array_merge(self::defaults(), $saved);
    }

    public static function activate(): void {
        if (!get_option(self::OPTION)) {
            add_option(self::OPTION, self::defaults(), '', false);
        }
    }

    public static function admin_menu(): void {
        add_menu_page(
            __('AAAStreamer', 'aaastreamer-connector'),
            __('AAAStreamer', 'aaastreamer-connector'),
            'manage_options',
            'aaastreamer-connector',
            [__CLASS__, 'render_admin_page'],
            'dashicons-controls-volumeon',
            58
        );
    }

    public static function register_settings(): void {
        register_setting('aaastreamer_connector', self::OPTION, [
            'type' => 'array',
            'sanitize_callback' => [__CLASS__, 'sanitize_settings'],
            'default' => self::defaults(),
        ]);
    }

    public static function sanitize_settings($input): array {
        $input = is_array($input) ? $input : [];
        $current = self::settings();
        $next = [];
        $next['enabled'] = empty($input['enabled']) ? '0' : '1';
        $next['account_enabled'] = empty($input['account_enabled']) ? '0' : '1';
        $next['wordpress_sso_enabled'] = empty($input['wordpress_sso_enabled']) ? '0' : '1';
        $next['comments_enabled'] = empty($input['comments_enabled']) ? '0' : '1';
        $next['hide_comments_on_stream_page'] = empty($input['hide_comments_on_stream_page']) ? '0' : '1';
        $next['iframe_admin'] = empty($input['iframe_admin']) ? '0' : '1';
        $next['api_base'] = esc_url_raw(trim((string)($input['api_base'] ?? $current['api_base'])));
        $next['stream_slug'] = sanitize_title((string)($input['stream_slug'] ?? $current['stream_slug']));
        $next['stream_title'] = sanitize_text_field((string)($input['stream_title'] ?? $current['stream_title']));
        $next['stream_description'] = sanitize_textarea_field((string)($input['stream_description'] ?? $current['stream_description']));
        $next['pls_url'] = esc_url_raw(trim((string)($input['pls_url'] ?? '')));
        $next['direct_stream_url'] = esc_url_raw(trim((string)($input['direct_stream_url'] ?? '')));
        $next['public_page_url'] = esc_url_raw(trim((string)($input['public_page_url'] ?? '')));
        $next['wordpress_page_url'] = esc_url_raw(trim((string)($input['wordpress_page_url'] ?? '')));
        $next['account_dashboard_url'] = esc_url_raw(trim((string)($input['account_dashboard_url'] ?? '')));
        $token = (string)($input['api_token'] ?? '');
        $next['api_token'] = $token === '********' ? (string)$current['api_token'] : sanitize_text_field($token);
        return $next;
    }

    public static function settings_updated($old_value, $value, string $option): void {
        if ($option !== self::OPTION || !is_array($value)) {
            return;
        }
        self::send_checkin($value);
    }

    public static function enqueue_frontend(): void {
        wp_register_style('aaastreamer-connector', plugins_url('assets/aaastreamer-connector.css', __FILE__), [], '0.1.1');
        wp_register_script('aaastreamer-connector', plugins_url('assets/aaastreamer-connector.js', __FILE__), [], '0.1.1', true);
    }

    public static function enqueue_admin(string $hook): void {
        if ($hook !== 'toplevel_page_aaastreamer-connector') {
            return;
        }
        wp_enqueue_style('aaastreamer-connector');
    }

    public static function register_rest_routes(): void {
        register_rest_route(self::REST_NAMESPACE, '/stream-url', [
            'methods' => 'GET',
            'permission_callback' => '__return_true',
            'callback' => [__CLASS__, 'rest_stream_url'],
        ]);
        register_rest_route(self::REST_NAMESPACE, '/account', [
            'methods' => 'GET',
            'permission_callback' => function () {
                return current_user_can('manage_options');
            },
            'callback' => [__CLASS__, 'rest_account'],
        ]);
        register_rest_route(self::REST_NAMESPACE, '/sso-token', [
            'methods' => 'POST',
            'permission_callback' => function () {
                return is_user_logged_in();
            },
            'callback' => [__CLASS__, 'rest_sso_token'],
        ]);
    }

    public static function rest_stream_url(): WP_REST_Response {
        $settings = self::settings();
        $url = self::resolve_stream_url($settings);
        return new WP_REST_Response([
            'enabled' => $settings['enabled'] === '1',
            'title' => $settings['stream_title'],
            'url' => $url,
            'publicPageUrl' => $settings['public_page_url'],
        ]);
    }

    public static function rest_account(): WP_REST_Response {
        $settings = self::settings();
        $status = self::fetch_stream_status($settings);
        return new WP_REST_Response([
            'accountEnabled' => $settings['account_enabled'] === '1',
            'streamSlug' => $settings['stream_slug'],
            'publicPageUrl' => $settings['public_page_url'],
            'dashboardUrl' => $settings['account_dashboard_url'],
            'status' => $status,
        ]);
    }

    public static function rest_sso_token(): WP_REST_Response {
        $settings = self::settings();
        if ($settings['wordpress_sso_enabled'] !== '1') {
            return new WP_REST_Response(['success' => false, 'error' => 'WordPress sign-in is disabled for AAAStreamer.'], 403);
        }
        $user = wp_get_current_user();
        $payload = [
            'iss' => home_url('/'),
            'aud' => rtrim($settings['api_base'], '/') . '/',
            'sub' => (string)$user->ID,
            'name' => $user->display_name,
            'email' => $user->user_email,
            'roles' => array_values((array)$user->roles),
            'streamSlug' => $settings['stream_slug'],
            'iat' => time(),
            'exp' => time() + 300,
        ];
        $secret = wp_salt('auth');
        $body = self::base64url(wp_json_encode($payload));
        $sig = self::base64url(hash_hmac('sha256', $body, $secret, true));
        return new WP_REST_Response([
            'success' => true,
            'token' => $body . '.' . $sig,
            'expiresAt' => $payload['exp'],
            'dashboardUrl' => $settings['account_dashboard_url'],
        ]);
    }

    public static function render_player_shortcode($atts = []): string {
        $settings = self::settings();
        $atts = shortcode_atts([
            'title' => $settings['stream_title'],
            'show_status' => '1',
        ], $atts, 'aaastreamer_player');

        wp_enqueue_style('aaastreamer-connector');
        wp_enqueue_script('aaastreamer-connector');
        wp_localize_script('aaastreamer-connector', 'AAAStreamerConnector', [
            'streamUrlEndpoint' => esc_url_raw(rest_url(self::REST_NAMESPACE . '/stream-url')),
        ]);

        $stream_url = self::resolve_stream_url($settings);
        $status = self::fetch_stream_status($settings);
        $is_enabled = $settings['enabled'] === '1' && $settings['account_enabled'] === '1';
        $player_id = 'aaastreamer-player-' . wp_generate_uuid4();

        ob_start();
        ?>
        <section class="aaastreamer-player" aria-labelledby="<?php echo esc_attr($player_id); ?>-title">
            <h2 id="<?php echo esc_attr($player_id); ?>-title"><?php echo esc_html($atts['title']); ?></h2>
            <?php if ($settings['stream_description'] !== '') : ?>
                <p><?php echo esc_html($settings['stream_description']); ?></p>
            <?php endif; ?>
            <?php if (!$is_enabled) : ?>
                <p role="status"><?php esc_html_e('This stream is not enabled from the WordPress dashboard right now.', 'aaastreamer-connector'); ?></p>
            <?php else : ?>
                <audio id="<?php echo esc_attr($player_id); ?>" class="aaastreamer-audio" controls preload="none" src="<?php echo esc_url($stream_url); ?>">
                    <?php esc_html_e('Your browser does not support the audio player. Use the stream page link below.', 'aaastreamer-connector'); ?>
                </audio>
                <p class="aaastreamer-actions">
                    <a class="aaastreamer-button" href="<?php echo esc_url($settings['public_page_url']); ?>"><?php esc_html_e('Open full stream page', 'aaastreamer-connector'); ?></a>
                </p>
                <?php if ($atts['show_status'] === '1') : ?>
                    <p class="aaastreamer-status" role="status">
                        <?php echo esc_html(self::status_label($status)); ?>
                    </p>
                <?php endif; ?>
            <?php endif; ?>
        </section>
        <?php
        return (string)ob_get_clean();
    }

    public static function render_account_panel_shortcode(): string {
        if (!current_user_can('manage_options')) {
            return '';
        }
        $settings = self::settings();
        ob_start();
        ?>
        <section class="aaastreamer-account-panel">
            <h2><?php esc_html_e('AAAStreamer account', 'aaastreamer-connector'); ?></h2>
            <p><?php echo esc_html($settings['account_enabled'] === '1' ? __('The linked stream account is enabled from WordPress.', 'aaastreamer-connector') : __('The linked stream account is disabled from WordPress.', 'aaastreamer-connector')); ?></p>
            <p><a class="button" href="<?php echo esc_url(admin_url('admin.php?page=aaastreamer-connector')); ?>"><?php esc_html_e('Manage AAAStreamer settings', 'aaastreamer-connector'); ?></a></p>
        </section>
        <?php
        return (string)ob_get_clean();
    }

    public static function render_comments_shortcode(): string {
        if (!is_singular()) {
            return '';
        }
        $post_id = get_the_ID();
        if (!$post_id) {
            return '';
        }
        $settings = self::settings();
        if ($settings['comments_enabled'] !== '1') {
            return '<section class="aaastreamer-comments"><h2>' . esc_html__('Listener comments', 'aaastreamer-connector') . '</h2><p>' . esc_html__('Comments are hidden for this WordPress stream page right now.', 'aaastreamer-connector') . '</p></section>';
        }
        ob_start();
        ?>
        <section class="aaastreamer-comments" aria-labelledby="aaastreamer-comments-title">
            <h2 id="aaastreamer-comments-title"><?php esc_html_e('Listener comments', 'aaastreamer-connector'); ?></h2>
            <p><?php esc_html_e('Comments are moderated through this WordPress dashboard.', 'aaastreamer-connector'); ?></p>
            <?php
            $comments = get_comments([
                'post_id' => $post_id,
                'status' => 'approve',
                'order' => 'ASC',
            ]);
            if ($comments) {
                echo '<ol class="comment-list">';
                wp_list_comments([
                    'style' => 'ol',
                    'short_ping' => true,
                    'avatar_size' => 48,
                ], $comments);
                echo '</ol>';
            } else {
                echo '<p>' . esc_html__('No comments yet.', 'aaastreamer-connector') . '</p>';
            }
            comment_form([
                'title_reply' => __('Leave a comment', 'aaastreamer-connector'),
                'comment_notes_before' => '<p class="comment-notes">' . esc_html__('Your comment may be held for moderation before it appears.', 'aaastreamer-connector') . '</p>',
            ], $post_id);
            ?>
        </section>
        <?php
        return (string)ob_get_clean();
    }

    public static function comments_open_for_stream_page(bool $open, int $post_id): bool {
        $settings = self::settings();
        if ($settings['comments_enabled'] !== '1') {
            return false;
        }
        if ((string)get_post_meta($post_id, '_aaastreamer_comments_enabled', true) === '1') {
            return true;
        }
        return $open;
    }

    public static function render_admin_page(): void {
        if (!current_user_can('manage_options')) {
            wp_die(esc_html__('You do not have permission to manage AAAStreamer settings.', 'aaastreamer-connector'));
        }
        $settings = self::settings();
        $status = self::fetch_stream_status($settings);
        ?>
        <div class="wrap aaastreamer-admin">
            <h1><?php esc_html_e('AAAStreamer', 'aaastreamer-connector'); ?></h1>
            <p><?php esc_html_e('Manage the linked AAAStreamer account, WordPress listen page player, and WordPress sign-in bridge for this site.', 'aaastreamer-connector'); ?></p>

            <h2><?php esc_html_e('SoulFoodRadio status', 'aaastreamer-connector'); ?></h2>
            <table class="widefat striped aaastreamer-status-table">
                <tbody>
                    <tr><th scope="row"><?php esc_html_e('Stream slug', 'aaastreamer-connector'); ?></th><td><?php echo esc_html($settings['stream_slug']); ?></td></tr>
                    <tr><th scope="row"><?php esc_html_e('Linked domain', 'aaastreamer-connector'); ?></th><td><a href="https://soulfoodradio.media">soulfoodradio.media</a></td></tr>
                    <tr><th scope="row"><?php esc_html_e('Current status', 'aaastreamer-connector'); ?></th><td><?php echo esc_html(self::status_label($status)); ?></td></tr>
                    <tr><th scope="row"><?php esc_html_e('Public stream page', 'aaastreamer-connector'); ?></th><td><a href="<?php echo esc_url($settings['public_page_url']); ?>"><?php echo esc_html($settings['public_page_url']); ?></a></td></tr>
                </tbody>
            </table>

            <form action="options.php" method="post">
                <?php settings_fields('aaastreamer_connector'); ?>
                <h2><?php esc_html_e('Account controls', 'aaastreamer-connector'); ?></h2>
                <table class="form-table" role="presentation">
                    <?php self::checkbox_row('enabled', __('Show listen player on WordPress page', 'aaastreamer-connector'), $settings); ?>
                    <?php self::checkbox_row('account_enabled', __('Enable linked SoulFoodRadio AAAStreamer account', 'aaastreamer-connector'), $settings); ?>
                    <?php self::checkbox_row('wordpress_sso_enabled', __('Allow login with WordPress for this linked AAAStreamer account', 'aaastreamer-connector'), $settings); ?>
                    <?php self::checkbox_row('comments_enabled', __('Allow comments on the WordPress stream page', 'aaastreamer-connector'), $settings); ?>
                    <?php self::checkbox_row('hide_comments_on_stream_page', __('Hide comments on the normal AAAStreamer stream page', 'aaastreamer-connector'), $settings); ?>
                    <?php self::checkbox_row('iframe_admin', __('Show embedded AAAStreamer dashboard panel when supported by the AAAStreamer site', 'aaastreamer-connector'), $settings); ?>
                </table>

                <h2><?php esc_html_e('Stream settings', 'aaastreamer-connector'); ?></h2>
                <table class="form-table" role="presentation">
                    <?php self::text_row('stream_title', __('Player title', 'aaastreamer-connector'), $settings); ?>
                    <?php self::textarea_row('stream_description', __('Player description', 'aaastreamer-connector'), $settings); ?>
                    <?php self::text_row('api_base', __('AAAStreamer API base URL', 'aaastreamer-connector'), $settings, 'url'); ?>
                    <?php self::text_row('stream_slug', __('AAAStreamer stream slug', 'aaastreamer-connector'), $settings); ?>
                    <?php self::text_row('pls_url', __('PLS URL', 'aaastreamer-connector'), $settings, 'url'); ?>
                    <?php self::text_row('direct_stream_url', __('Direct stream URL override', 'aaastreamer-connector'), $settings, 'url'); ?>
                    <?php self::text_row('public_page_url', __('Public stream page URL', 'aaastreamer-connector'), $settings, 'url'); ?>
                    <?php self::text_row('wordpress_page_url', __('WordPress listen page URL', 'aaastreamer-connector'), $settings, 'url'); ?>
                    <?php self::text_row('account_dashboard_url', __('AAAStreamer dashboard URL', 'aaastreamer-connector'), $settings, 'url'); ?>
                    <?php self::password_row('api_token', __('AAAStreamer API token', 'aaastreamer-connector'), $settings); ?>
                </table>
                <?php submit_button(__('Save AAAStreamer settings', 'aaastreamer-connector')); ?>
            </form>

            <h2><?php esc_html_e('Account dashboard', 'aaastreamer-connector'); ?></h2>
            <?php if ($settings['iframe_admin'] === '1') : ?>
                <iframe class="aaastreamer-dashboard-frame" title="<?php esc_attr_e('AAAStreamer dashboard', 'aaastreamer-connector'); ?>" src="<?php echo esc_url($settings['account_dashboard_url']); ?>"></iframe>
            <?php else : ?>
                <p><a class="button button-primary" href="<?php echo esc_url($settings['account_dashboard_url']); ?>"><?php esc_html_e('Open AAAStreamer dashboard', 'aaastreamer-connector'); ?></a></p>
            <?php endif; ?>

            <h2><?php esc_html_e('Shortcodes', 'aaastreamer-connector'); ?></h2>
            <p><code>[aaastreamer_player]</code></p>
            <p><code>[aaastreamer_comments]</code></p>
            <p><code>[aaastreamer_account_panel]</code></p>
        </div>
        <?php
    }

    private static function checkbox_row(string $key, string $label, array $settings): void {
        ?>
        <tr>
            <th scope="row"><?php echo esc_html($label); ?></th>
            <td>
                <label>
                    <input type="checkbox" name="<?php echo esc_attr(self::OPTION . '[' . $key . ']'); ?>" value="1" <?php checked($settings[$key] ?? '', '1'); ?>>
                    <?php esc_html_e('Enabled', 'aaastreamer-connector'); ?>
                </label>
            </td>
        </tr>
        <?php
    }

    private static function text_row(string $key, string $label, array $settings, string $type = 'text'): void {
        ?>
        <tr>
            <th scope="row"><label for="aaastreamer-<?php echo esc_attr($key); ?>"><?php echo esc_html($label); ?></label></th>
            <td><input class="regular-text" id="aaastreamer-<?php echo esc_attr($key); ?>" type="<?php echo esc_attr($type); ?>" name="<?php echo esc_attr(self::OPTION . '[' . $key . ']'); ?>" value="<?php echo esc_attr($settings[$key] ?? ''); ?>"></td>
        </tr>
        <?php
    }

    private static function textarea_row(string $key, string $label, array $settings): void {
        ?>
        <tr>
            <th scope="row"><label for="aaastreamer-<?php echo esc_attr($key); ?>"><?php echo esc_html($label); ?></label></th>
            <td><textarea class="large-text" rows="4" id="aaastreamer-<?php echo esc_attr($key); ?>" name="<?php echo esc_attr(self::OPTION . '[' . $key . ']'); ?>"><?php echo esc_textarea($settings[$key] ?? ''); ?></textarea></td>
        </tr>
        <?php
    }

    private static function password_row(string $key, string $label, array $settings): void {
        $has_token = !empty($settings[$key]);
        ?>
        <tr>
            <th scope="row"><label for="aaastreamer-<?php echo esc_attr($key); ?>"><?php echo esc_html($label); ?></label></th>
            <td>
                <input class="regular-text" id="aaastreamer-<?php echo esc_attr($key); ?>" type="password" name="<?php echo esc_attr(self::OPTION . '[' . $key . ']'); ?>" value="<?php echo esc_attr($has_token ? '********' : ''); ?>" autocomplete="new-password">
                <p class="description"><?php esc_html_e('Stored in WordPress options. Leave the masked value unchanged to keep the current token.', 'aaastreamer-connector'); ?></p>
            </td>
        </tr>
        <?php
    }

    private static function resolve_stream_url(array $settings): string {
        if (!empty($settings['direct_stream_url'])) {
            return (string)$settings['direct_stream_url'];
        }
        $pls = (string)($settings['pls_url'] ?? '');
        if ($pls === '') {
            return '';
        }
        $cached = get_transient('aaastreamer_resolved_stream_' . md5($pls));
        if (is_string($cached) && $cached !== '') {
            return $cached;
        }
        $response = wp_remote_get($pls, [
            'timeout' => 6,
            'redirection' => 3,
            'user-agent' => 'AAAStreamer WordPress Connector/' . get_bloginfo('version'),
        ]);
        if (is_wp_error($response)) {
            return $pls;
        }
        $body = (string)wp_remote_retrieve_body($response);
        $resolved = '';
        foreach (preg_split('/\r\n|\r|\n/', $body) as $line) {
            if (stripos($line, 'File') === 0 && str_contains($line, '=')) {
                $resolved = trim((string)substr($line, strpos($line, '=') + 1));
                break;
            }
        }
        if ($resolved === '') {
            $resolved = $pls;
        }
        set_transient('aaastreamer_resolved_stream_' . md5($pls), $resolved, MINUTE_IN_SECONDS * 5);
        return $resolved;
    }

    private static function fetch_stream_status(array $settings): array {
        $api = rtrim((string)$settings['api_base'], '/');
        $slug = (string)$settings['stream_slug'];
        if ($api === '' || $slug === '') {
            return ['success' => false, 'error' => 'Not configured'];
        }
        $headers = [];
        if (!empty($settings['api_token'])) {
            $headers['Authorization'] = 'Bearer ' . $settings['api_token'];
        }
        $response = wp_remote_get($api . '/api/streams/' . rawurlencode($slug), [
            'timeout' => 6,
            'headers' => $headers,
        ]);
        if (is_wp_error($response)) {
            return ['success' => false, 'error' => $response->get_error_message()];
        }
        $body = json_decode((string)wp_remote_retrieve_body($response), true);
        if (!is_array($body)) {
            return ['success' => false, 'error' => 'AAAStreamer did not return JSON'];
        }
        return $body;
    }

    private static function status_label(array $status): string {
        if (!empty($status['success']) && !empty($status['stream'])) {
            $stream = is_array($status['stream']) ? $status['stream'] : [];
            if (!empty($stream['isLive']) || !empty($stream['live'])) {
                return __('Stream status: live.', 'aaastreamer-connector');
            }
            return __('Stream status: configured but not live right now.', 'aaastreamer-connector');
        }
        if (!empty($status['error'])) {
            return sprintf(__('Stream status: %s', 'aaastreamer-connector'), sanitize_text_field((string)$status['error']));
        }
        return __('Stream status: not available right now.', 'aaastreamer-connector');
    }

    private static function send_checkin(array $settings): void {
        $api = rtrim((string)($settings['api_base'] ?? ''), '/');
        if ($api === '' || empty($settings['stream_slug'])) {
            return;
        }
        $payload = [
            'siteUrl' => home_url('/'),
            'restBaseUrl' => rest_url(self::REST_NAMESPACE),
            'listenPageUrl' => !empty($settings['wordpress_page_url']) ? (string)$settings['wordpress_page_url'] : home_url('/'),
            'publicPageUrl' => (string)($settings['public_page_url'] ?? ''),
            'streamSlug' => (string)$settings['stream_slug'],
            'pluginVersion' => '0.1.1',
            'enabled' => ($settings['enabled'] ?? '0') === '1',
            'accountEnabled' => ($settings['account_enabled'] ?? '0') === '1',
            'commentsEnabled' => ($settings['comments_enabled'] ?? '0') === '1',
            'hideCommentsOnStreamPage' => ($settings['hide_comments_on_stream_page'] ?? '0') === '1',
        ];
        $headers = ['Content-Type' => 'application/json'];
        if (!empty($settings['api_token'])) {
            $headers['Authorization'] = 'Bearer ' . $settings['api_token'];
        }
        wp_remote_post($api . '/api/wordpress/checkin', [
            'timeout' => 6,
            'headers' => $headers,
            'body' => wp_json_encode($payload),
        ]);
    }

    private static function base64url(string $value): string {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}

AAAStreamer_Connector::boot();
