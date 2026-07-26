"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/hooks/useMe";
import { useWorkspace, useUpdateWorkspace, useUpdateProfile, useChangePassword } from "@/hooks/useWorkspace";
import { useWebhookStatus } from "@/hooks/useAutomations";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { isApiError } from "@/lib/auth";

export default function SettingsPage() {
  const { data: me } = useMe();
  const workspace = useWorkspace();
  const updateWorkspace = useUpdateWorkspace();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const webhook = useWebhookStatus();

  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [wsName, setWsName] = useState("");
  const [wsCurrency, setWsCurrency] = useState("");
  const [wsSaved, setWsSaved] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (me?.user) {
      setName(me.user.name);
      setTimezone(me.user.timezone);
    }
  }, [me?.user]);

  useEffect(() => {
    if (workspace.data) {
      setWsName(workspace.data.name);
      setWsCurrency(workspace.data.defaultCurrency);
    }
  }, [workspace.data]);

  async function onSaveProfile() {
    setProfileError(null);
    setProfileSaved(false);
    try {
      await updateProfile.mutateAsync({ name, timezone });
      setProfileSaved(true);
    } catch (err) {
      setProfileError(isApiError(err) ? err.message : "Could not save profile.");
    }
  }

  async function onSaveWorkspace() {
    setWsError(null);
    setWsSaved(false);
    try {
      await updateWorkspace.mutateAsync({ name: wsName, defaultCurrency: wsCurrency });
      setWsSaved(true);
    } catch (err) {
      setWsError(isApiError(err) ? err.message : "Could not save workspace settings.");
    }
  }

  async function onChangePassword() {
    setPwError(null);
    setPwSaved(false);
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword });
      setPwSaved(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPwError(isApiError(err) ? err.message : "Could not change password.");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-lg font-semibold text-ink">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="p-email">Email</Label>
            <Input id="p-email" value={me?.user?.email ?? ""} disabled />
          </div>
          <div>
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="p-tz">Timezone</Label>
            <Input id="p-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="e.g. America/New_York" />
          </div>
          <FieldError>{profileError}</FieldError>
          {profileSaved ? <p className="text-xs text-health-healthy">Saved.</p> : null}
          <div className="flex justify-end">
            <Button variant="primary" loading={updateProfile.isPending} onClick={onSaveProfile}>
              Save profile
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {workspace.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <div>
                <Label htmlFor="w-name">Workspace name</Label>
                <Input id="w-name" value={wsName} onChange={(e) => setWsName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="w-currency">Default currency</Label>
                <Input id="w-currency" value={wsCurrency} onChange={(e) => setWsCurrency(e.target.value.toUpperCase())} maxLength={3} />
              </div>
              <FieldError>{wsError}</FieldError>
              {wsSaved ? <p className="text-xs text-health-healthy">Saved.</p> : null}
              <div className="flex justify-end">
                <Button variant="primary" loading={updateWorkspace.isPending} onClick={onSaveWorkspace}>
                  Save workspace
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex items-center justify-between">
            <p className="text-sm text-ink-muted">n8n webhook</p>
            {webhook.isLoading ? (
              <Skeleton className="h-5 w-32" />
            ) : webhook.data?.configured ? (
              <Badge tone="healthy" dot>
                Configured ({webhook.data.url})
              </Badge>
            ) : (
              <Badge tone="attention" dot>
                Not configured
              </Badge>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <Label htmlFor="pw-current">Current password</Label>
            <Input id="pw-current" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pw-new">New password</Label>
            <Input id="pw-new" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </div>
          <FieldError>{pwError}</FieldError>
          {pwSaved ? <p className="text-xs text-health-healthy">Password changed.</p> : null}
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={!currentPassword || !newPassword}
              loading={changePassword.isPending}
              onClick={onChangePassword}
            >
              Change password
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
